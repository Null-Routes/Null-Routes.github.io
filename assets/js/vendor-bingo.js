(function () {
  "use strict";

  var app = document.getElementById("bingo-app");
  if (!app) return;

  // The JSON file lives in the repo root; the page passes its URL in via data-source.
  var SOURCE_URL = app.dataset.source;

  var boardEl = document.getElementById("board");
  var generateBtn = document.getElementById("generateBtn");
  var statusEl = document.getElementById("status");

  var squaresPool = [];

  function setStatus(text, opts) {
    opts = opts || {};
    statusEl.textContent = "";
    var dot = document.createElement("span");
    dot.className = "dot";
    statusEl.classList.toggle("error", !!opts.error);
    statusEl.appendChild(dot);
    statusEl.append(" " + text);
  }

  // Accepts either a list of strings or a list of {"bingo-square": "..."} objects.
  function normalize(data) {
    var seen = new Set();
    var out = [];
    data.forEach(function (item) {
      var text = "";
      if (typeof item === "string") {
        text = item;
      } else if (item && typeof item === "object") {
        text = item["bingo-square"] || item.bingoSquare || "";
      }
      text = String(text).trim();
      if (text && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        out.push(text);
      }
    });
    return out;
  }

  async function fetchSquares() {
    setStatus("Loading squares…");
    generateBtn.disabled = true;
    try {
      var res = await fetch(SOURCE_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      var data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Expected a JSON array");
      }
      squaresPool = normalize(data);

      if (squaresPool.length < 24) {
        throw new Error("Need at least 24 items; got " + squaresPool.length);
      }

      setStatus("Loaded " + squaresPool.length + " squares. Deal yourself a card.");
      buildCard();
    } catch (err) {
      console.error(err);
      setStatus("Error loading squares: " + err.message, { error: true });
    } finally {
      generateBtn.disabled = false;
    }
  }

  function shuffle(array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function buildCard() {
    if (squaresPool.length < 24) {
      setStatus("Not enough squares loaded yet. Check bingo_squares.json.", { error: true });
      return;
    }

    var selected = shuffle(squaresPool.slice()).slice(0, 24);

    var tiles = [];
    var selectedIndex = 0;
    for (var i = 0; i < 25; i++) {
      if (i === 12) {
        tiles.push({ label: "Free Tile", free: true });
      } else {
        tiles.push({ label: selected[selectedIndex++], free: false });
      }
    }

    renderBoard(tiles);
    setStatus("New card ready. Start the demo and tap to track the nonsense.");
  }

  function toggle(cell) {
    var marked = cell.classList.toggle("marked");
    cell.setAttribute("aria-pressed", marked ? "true" : "false");
  }

  function renderBoard(tiles) {
    boardEl.innerHTML = "";
    tiles.forEach(function (tile, index) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = index;
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");

      if (tile.free) {
        cell.classList.add("free", "marked"); // free tile starts marked
        cell.innerHTML = "FREE<br/><small>Center</small>";
        cell.setAttribute("aria-pressed", "true");
      } else {
        cell.textContent = tile.label;
        cell.setAttribute("aria-pressed", "false");
      }

      cell.addEventListener("click", function () {
        toggle(cell);
      });
      cell.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(cell);
        }
      });

      boardEl.appendChild(cell);
    });
  }

  generateBtn.addEventListener("click", buildCard);

  fetchSquares();
})();
