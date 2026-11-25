# BABYMONSTER · Vocabulary World Tour

An unofficial fan quiz in English (B2–C1). Full World Tour covers all 118 questions in four stages. Quick Comeback draws 30 questions proportionally across all nine categories.

## Open offline

Keep `index.html`, `style.css`, `questions.js` and `script.js` together. Open `index.html` in a browser. Use the four answer buttons or keys 1–4. Press Enter on a focused button to activate it. Progress is saved in the current browser when local storage is available. Browsers may handle storage differently for local files. Use the hosted URL if your browser restricts local-file storage.

## Publish on GitHub Pages

Upload the four site files to the root of a GitHub repository. In the repository's **Settings → Pages**, select **Deploy from a branch**, choose the branch containing the files and select **/(root)**. Save the configuration and open the URL displayed in **Pages** once deployment finishes.

## Add cover art

Place an image you have permission to use at `assets/hero.webp`, relative to `index.html`. The cover uses it as a background layer. Keep the area behind the headline dark for readability. The CSS design also works without the file.

## Extend the bank

Add entries to `window.QUESTIONS` in `questions.js`. Give each entry a unique `id` and `target`, a `category`, a `stem` with exactly one `___`, a `correct` answer, three distinct `distractors` and a short `explanation`. Keep the distractors distinct from the correct answer. Increment `BANK_VERSION` in `script.js` to reset existing attempts. Update the cover and mode labels in `index.html` if the bank size or number of categories changes. Keep enough questions per category for the proportional quick sample.
