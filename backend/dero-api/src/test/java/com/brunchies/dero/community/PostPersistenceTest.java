package com.brunchies.dero.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.community.repository.PostCommentRepository;
import com.brunchies.dero.community.repository.PostLikeRepository;
import com.brunchies.dero.community.repository.PostRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 게시글 5테이블({@code post}·{@code post_image}·{@code post_like}·{@code post_comment}·
 * {@code post_hashtag})이 실제 Postgres에 그대로 실리는지 검증한다
 * (2026-07-30 신설, DERO-270 — ADR-0011·ADR-0013).
 *
 * <p>못 박는 것 셋이다. ① <b>{@link PostImage} 저장이 {@link Post} 루트를 통과한다</b> —
 * {@code PostImageRepository}가 금지돼(ADR-0011 결정 8) {@code cascade}가 빠지면 저장만 조용히
 * 안 된다. ② <b>부분 유니크 {@code uq_post_image_post_id}({@code WHERE is_primary})가 작동한다.</b>
 * ③ <b>{@link Post}에 배치 FK가 없다</b> — 참조는 본문 토큰이고, 그래서 배치 없이도 글이 저장된다.
 */
class PostPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PostRepository postRepository;

	@Autowired
	private PostLikeRepository postLikeRepository;

	@Autowired
	private PostCommentRepository postCommentRepository;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private HashtagRepository hashtagRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	@DisplayName("게시글 왕복 — 배치 FK 없이 저장되고 본문의 [[placement:ID]] 토큰이 그대로 남는다")
	void 게시글_왕복() {
		User author = saveUser("post@example.com", "kakao-post-1", "글쓴이");
		Post post = Post.create(author, "내 첫 데스크테리어",
				"이렇게 꾸몄어요 [[placement:42]] 그리고 [[placement:43]]");

		Long id = postRepository.save(post).getId();
		entityManager.flush();
		entityManager.clear();

		Post found = postRepository.findById(id).orElseThrow();
		assertThat(found.getTitle()).isEqualTo("내 첫 데스크테리어");
		assertThat(found.getContent()).contains("[[placement:42]]", "[[placement:43]]");
		assertThat(found.getLikeCount()).isZero();
		assertThat(found.getUser().getId()).isEqualTo(author.getId());
		assertThat(found.getCreatedAt()).isNotNull();
		assertThat(found.getDeletedAt()).isNull();
	}

	@Test
	@DisplayName("작성자 없는 글도 저장된다 — user_id는 ON DELETE SET NULL이라 nullable이다")
	void 작성자_없는_글() {
		Long id = postRepository.save(Post.create(null, "익명 글", "본문")).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(postRepository.findById(id).orElseThrow().getUser()).isNull();
	}

	@Test
	@DisplayName("사진 왕복 — 루트를 통해 cascade 저장되고 썸네일 1장 + 나머지가 그대로 읽힌다")
	void 사진_왕복() {
		Post post = Post.create(saveUser("img@example.com", "kakao-post-2", "사진가"), "사진 글",
				"![책상](post-images/a.png) 본문 ![의자](post-images/b.png)");
		post.addImage(PostImage.create(post, "post-images/a.png", true));
		post.addImage(PostImage.create(post, "post-images/b.png", false));

		Long id = postRepository.save(post).getId();
		entityManager.flush();
		entityManager.clear();

		List<PostImage> found = postRepository.findById(id).orElseThrow().getImages();
		assertThat(found).hasSize(2);
		assertThat(found).filteredOn(PostImage::isPrimary)
				.singleElement()
				.satisfies(image -> {
					assertThat(image.getImageKey()).isEqualTo("post-images/a.png");
					assertThat(image.getUpdatedAt()).isNull();
				});
	}

	@Test
	@DisplayName("같은 게시글에 썸네일 2장을 두면 거부된다 — uq_post_image_post_id WHERE is_primary")
	void 썸네일_중복_거부() {
		Post post = Post.create(saveUser("dup@example.com", "kakao-post-3", "중복"), "글", "본문");
		post.addImage(PostImage.create(post, "post-images/c.png", true));
		postRepository.save(post);
		entityManager.flush();

		post.addImage(PostImage.create(post, "post-images/d.png", true));
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	@Test
	@DisplayName("좋아요 왕복 — post_like는 Post 밖의 각자 루트라 자기 리포지토리로 저장된다")
	void 좋아요_왕복() {
		User user = saveUser("like@example.com", "kakao-post-4", "좋아요");
		Post post = postRepository.save(Post.create(user, "좋아요 글", "본문"));

		Long id = postLikeRepository.save(PostLike.create(user, post)).getId();
		entityManager.flush();
		entityManager.clear();

		PostLike found = postLikeRepository.findById(id).orElseThrow();
		assertThat(found.getUser().getId()).isEqualTo(user.getId());
		assertThat(found.getPost().getId()).isEqualTo(post.getId());
		// 토글·정션이라 생성 후 변하지 않는다 — updated_at은 영원히 NULL이다.
		assertThat(found.getUpdatedAt()).isNull();
	}

	@Test
	@DisplayName("같은 사용자가 같은 글에 두 번 좋아요하면 거부된다 — uq_post_like_user_id_post_id")
	void 좋아요_중복_거부() {
		User user = saveUser("like2@example.com", "kakao-post-5", "중복좋아요");
		Post post = postRepository.save(Post.create(user, "글", "본문"));

		postLikeRepository.save(PostLike.create(user, post));
		entityManager.flush();

		postLikeRepository.save(PostLike.create(user, post));
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	@Test
	@DisplayName("댓글 왕복 — 작성자 없는 댓글도 저장된다(ON DELETE SET NULL)")
	void 댓글_왕복() {
		Post post = postRepository.save(
				Post.create(saveUser("c@example.com", "kakao-post-6", "댓글"), "글", "본문"));

		Long id = postCommentRepository.save(PostComment.create(post, null, "잘 봤습니다")).getId();
		entityManager.flush();
		entityManager.clear();

		PostComment found = postCommentRepository.findById(id).orElseThrow();
		assertThat(found.getContent()).isEqualTo("잘 봤습니다");
		assertThat(found.getUser()).isNull();
		assertThat(found.getPost().getId()).isEqualTo(post.getId());
		assertThat(found.getDeletedAt()).isNull();
	}

	@Test
	@DisplayName("해시태그 정션 왕복 — hashtag 마스터를 product_hashtag와 공유한다")
	void 해시태그_왕복() {
		Post post = postRepository.save(
				Post.create(saveUser("h@example.com", "kakao-post-7", "태그"), "글", "본문"));
		Hashtag hashtag = hashtagRepository.save(Hashtag.create("미니멀", null));

		// post_hashtag는 애그리거트 루트가 아니라 리포지토리가 없다 — EntityManager로 직접 저장한다.
		PostHashtag junction = PostHashtag.create(post, hashtag);
		entityManager.persist(junction);
		entityManager.flush();
		entityManager.clear();

		PostHashtag found = entityManager.find(PostHashtag.class, junction.getId());
		assertThat(found.getPost().getId()).isEqualTo(post.getId());
		assertThat(found.getHashtag().getId()).isEqualTo(hashtag.getId());
	}

	@Test
	@DisplayName("같은 (글, 태그)를 두 번 붙이면 거부된다 — uq_post_hashtag_post_id_hashtag_id")
	void 해시태그_중복_거부() {
		Post post = postRepository.save(
				Post.create(saveUser("h2@example.com", "kakao-post-8", "태그중복"), "글", "본문"));
		Hashtag hashtag = hashtagRepository.save(Hashtag.create("우드톤", null));

		entityManager.persist(PostHashtag.create(post, hashtag));
		entityManager.flush();

		entityManager.persist(PostHashtag.create(post, hashtag));
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	private User saveUser(String email, String providerId, String nickname) {
		return userRepository.save(User.create(email, Provider.KAKAO, providerId, nickname));
	}
}
