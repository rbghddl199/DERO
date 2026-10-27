---
paths:
  - "**/*.java"
---
# DERO Java Project Convention

Formatting and naming only. Indentation and the format source of truth are canonical in
`architecture.md` §3; structural rules are the rest of `architecture.md`, query examples
`query-conventions.md`, tool choice `querydsl-rubric.md` — all auto-injected on the same paths, so do
not restate them here. Based on the
[Google Java Style Guide](https://google.github.io/styleguide/javaguide.html).

- Line length: **100 columns**.
- **No wildcard imports, no omitted braces, no two statements on one line.**
- Remove unused imports. Javadoc on public API only.

```java
// GOOD
class UpperCamelCase {
	private static final int UPPER_SNAKE_CASE = 1;

	void lowerCamelCase() {
		if (x) {
			doThing();
		}
	}
}

// BAD
import java.util.*;
if (x) doThing(); doOther();
```

`Reformat Code` is a human GUI action — agents cannot run it. Scheme import: `README.md`.
