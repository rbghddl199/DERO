# syntax=docker/dockerfile:1

# dero-api 실행 이미지. 빌드는 이미지 안에서 끝난다 — 호스트에 JDK가 없어도 된다.
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build

# 의존성 선언만 먼저 넣어 해석 결과를 레이어에 캐시한다. 소스만 바뀌면 재다운로드가 없다.
COPY gradlew ./
COPY gradle ./gradle
COPY settings.gradle build.gradle ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies

COPY src ./src
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# bootJar만 실행하므로 build/libs에 부트 jar 하나만 남는다(plain jar 없음).
COPY --from=build /build/build/libs/*.jar app.jar

RUN addgroup -S dero && adduser -S -G dero dero
USER dero

EXPOSE 8080

# datasource·redis 설정은 이미지에 굽지 않는다. SPRING_DATASOURCE_* 등을 실행 시 주입한다.
ENTRYPOINT ["java", "-Duser.timezone=Asia/Seoul", "-jar", "app.jar"]
