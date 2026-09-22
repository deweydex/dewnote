---
title: Constructs the Corpus Lacks
year: "2026-2027"
version: 2026.09.22.1
---

# Constructs the Corpus Lacks

A line that breaks<br />here, and another <br> there.

It costs $5 and $6, which is not a formula.

A [reference link][ref] and a plain one.

[ref]: https://example.com/reference "A title"

**1.** What is two and two?

<details class="dl-answer"><summary>answer</summary>

4.

Two pairs make four.

</details>

```question
id: which-one
type: multiple-choice
correct: 2

Which counts this correctly?

- A permutation.
- A combination.
```

```python exec
id: with-headers
hint: errors:3
expect: total == 6
name: Adding up
total = 1 + 2 + 3
```

```sql exec cell=scores persist
id: scores
SELECT 1 AS one;
```

~~~python
print("a tilde fence")
~~~

````markdown
```python
print("a fence inside a fence")
```
````

1. A step with code under it:

   ```python
   print("inside a list")
   ```

2. Another step.

- [x] done
- [ ] not done

| Left | Centre | Right |
|:-----|:------:|------:|
| a    | b      | c     |
