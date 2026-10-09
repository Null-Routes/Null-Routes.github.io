# Null Routes

Personal project site, built with Jekyll and hosted on GitHub Pages.

## Publishing

1. Create a repo named `Null-Routes.github.io` and push this folder to the `main` branch.
2. In the repo, go to **Settings > Pages** and set the source to **Deploy from a branch**, `main` / `(root)`.
3. The site goes live at `https://null-routes.github.io/`.

## Run locally

```sh
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000.

## Adding things

- **A project:** add an entry to the top of `_data/projects.yml`. It shows up on the Projects page and the homepage automatically.
- **A nav link:** add an entry to `_data/navigation.yml`.
- **Bingo squares:** edit `bingo_squares.json` in the repo root (a plain list of strings, at least 24).

## Layout

| Path | Purpose |
| --- | --- |
| `_config.yml` | Site settings |
| `_layouts/default.html` | Shared layout with the top nav |
| `_includes/` | Nav, footer, project card |
| `assets/css/main.css` | Site-wide styles |
| `projects/vendor-bingo.html` | The bingo game page |
| `bingo_squares.json` | Bingo square list, served at `/bingo_squares.json` |
