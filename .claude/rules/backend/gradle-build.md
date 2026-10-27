---
paths:
  - "**/build.gradle"
  - "**/settings.gradle"
  - "**/gradle.properties"
---
# DERO Backend Gradle Rules

Output language: Korean.

Evidence and failure narratives live in `docs/context/backend-runtime.md`. This file holds only
what prevents the mistake while `build.gradle` is open.
(Over 300 words on purpose: all four sections are violable while this file is open — the narrative already moved out.)

## 1. Spring Boot 4.1 starter names differ from Boot 3

`-webmvc` not `spring-boot-starter-web`; `-security-oauth2-client` not `-oauth2-client`; per-slice
`-test` starters (`...-webmvc-test`, `...-data-jpa-test`) not one `spring-boot-starter-test`.

**Add a dependency by copying notation already present in this file**, never from memory or a
tutorial — Boot 3 names break at dependency resolution.

## 2. QueryDSL wiring is done — do not re-add Gradle-4-era boilerplate

- Artifact group is the openfeign fork **`io.github.openfeign.querydsl:7.0`**, not `com.querydsl`
  (upstream 5.1.0 dates from JPA 3.1/Hibernate 6). **Imports stay `com.querydsl.*`.**
- apt is a **three-line set**: `querydsl-apt:7.0:jakarta` + `jakarta.annotation-api` +
  `jakarta.persistence-api`.
- Q classes land in `build/generated/sources/annotationProcessor/java/main` and Gradle adds that
  path to the source set automatically. **Do not hand-add `sourceSets` / `querydslDir` /
  `clean.doLast`** — most online QueryDSL guides date from Gradle 4 and are needless complexity now.
- After `clean`, `./gradlew compileJava` must rerun before an IDE can see Q classes.

## 3. Flyway is a compile dependency, so its autoconfiguration is always on

`spring-boot-starter-flyway` sits in this file's `dependencies` block, so `spring.flyway.enabled`
defaults to `true` and migrations run **before** JPA on every local boot. Removing or adding that
dependency changes boot behaviour in every profile — see `docs/context/deployment.md` §9 before
touching it.

## 4. spotless — the Dockerfile runs `bootJar` only, and `spotlessApply` is banned (time-limited)

Measurements and the full failure narrative: `docs/context/backend-runtime.md` §1-14.

- **Never put `check`/`build` in the deploy Dockerfile — `bootJar` only.** spotless tasks require a
  git repo (`ratchetFrom 'origin/develop'`) and the Dockerfile copies no `.git`: CI passes, only the
  deploy dies.
- ⚠ **Do not run `spotlessApply`** — two conflicting indentation rules (tabs vs 2 spaces) make it
  emit an unreviewable whole-file reformat diff. **This ban expires when DERO-619 closes** —
  once 619 unifies the scheme, delete this line.
- **Change the format scheme only together with the `googleJavaFormat` version/config** — if
  IntelliJ Reformat and spotless disagree, they revert each other on every save.
