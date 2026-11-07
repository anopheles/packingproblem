// Short hand-written notes for notable n. Kept to facts from the catalog and its sources.

export const notes: Record<number, string> = {
  5: "The first n where tilting a square helps: four squares in the corners and one at 45° in the middle beat the 3 × 3 grid.",
  10: "Found by Göbel in 1979, but proving nothing smaller works took until Stromquist in 2003.",
  11: "Trump's 1979 packing is still listed as best known, not proved. A computer-checked (Lean) proof of its optimality was announced in autumn 2026; the catalog doesn't mark it proved yet.",
  17: "Seventeen is the strangest of the small cases. Bidwell's 1998 arrangement tilts its squares at two unrelated angles (about 39.80° and 36.62°), and its side length is a root of a degree-18 polynomial. Nobody has beaten it in almost three decades, and nobody has proved it can't be beaten.",
  18: "Two different packings tie here. The side length has a tidy closed form, 7/2 + √7/2, and the pictured version keeps as few squares tilted as possible.",
  19: "Like 17 and 18, this one sits just below the 5 × 5 grid and is still open. Its side is 3 + 4√2/3.",
};
