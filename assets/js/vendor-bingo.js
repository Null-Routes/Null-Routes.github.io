(function () {
  "use strict";

  var app = document.getElementById("bingo-app");
  if (!app) return;

  // The JSON file lives in the repo root; the page passes its URL in via data-source.
  var SOURCE_URL = app.dataset.source;

  var boardEl = document.getElementById("board");
  var generateBtn = document.getElementById("generateBtn");
  var statusEl = document.getElementById("status");
  var shareBtn = document.getElementById("shareBtn");
  var shareDialog = document.getElementById("shareDialog");
  var shareImg = document.getElementById("shareImg");
  var shareMsg = document.getElementById("shareMsg");
  var shareDownload = document.getElementById("shareDownload");
  var shareNative = document.getElementById("shareNative");
  var shareCopy = document.getElementById("shareCopy");
  var shareClose = document.getElementById("shareClose");

  var squaresPool = [];
  var shareUrl = null; // object URL for the current preview image
  var shareBlob = null;

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
    shareBtn.disabled = false;
  }

  /* ---------- Share card as an image ---------- */

  var FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // Read the card as it is on screen right now, including which squares are marked.
  function readCard() {
    return Array.prototype.map.call(boardEl.children, function (cell) {
      var free = cell.classList.contains("free");
      return {
        free: free,
        marked: cell.classList.contains("marked"),
        label: free ? "FREE" : cell.textContent
      };
    });
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = text.split(/\s+/);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Pick the largest font size where the text fits inside the cell.
  function fitText(ctx, text, maxWidth, maxHeight) {
    var sizes = [26, 24, 22, 20, 18, 16];
    for (var i = 0; i < sizes.length; i++) {
      var size = sizes[i];
      ctx.font = "600 " + size + "px " + FONT;
      var lines = wrapLines(ctx, text, maxWidth);
      var widest = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; }));
      var lineHeight = Math.round(size * 1.22);
      if (widest <= maxWidth && lines.length * lineHeight <= maxHeight) {
        return { size: size, lines: lines, lineHeight: lineHeight };
      }
    }
    var last = sizes[sizes.length - 1];
    ctx.font = "600 " + last + "px " + FONT;
    return { size: last, lines: wrapLines(ctx, text, maxWidth), lineHeight: Math.round(last * 1.22) };
  }

  function renderCardCanvas(cells) {
    var W = 1080;
    var CELL = 180;
    var GAP = 12;
    var BOARD = CELL * 5 + GAP * 4;
    var PAD = (W - BOARD) / 2;
    var BOARD_TOP = 250;
    var H = BOARD_TOP + BOARD + 120;

    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");

    // Page background
    var bg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.35, "#020617");
    bg.addColorStop(1, "#000000");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "700 52px " + FONT;
    ctx.fillText("Security Vendor Demo Bingo", PAD, 96);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "400 26px " + FONT;
    ctx.fillText("Tracking the buzzwords, one square at a time", PAD, 140);

    // B I N G O header
    var letters = ["B", "I", "N", "G", "O"];
    ctx.textAlign = "center";
    ctx.font = "600 34px " + FONT;
    letters.forEach(function (letter, i) {
      var cx = PAD + i * (CELL + GAP) + CELL / 2;
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(letter.split("").join(" "), cx, 214);
    });
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 2;
    for (var h = 0; h < 5; h++) {
      var lx = PAD + h * (CELL + GAP);
      ctx.beginPath();
      ctx.moveTo(lx, 228);
      ctx.lineTo(lx + CELL, 228);
      ctx.stroke();
    }

    // Cells
    var markedCount = 0;
    cells.forEach(function (cell, i) {
      var col = i % 5;
      var row = Math.floor(i / 5);
      var x = PAD + col * (CELL + GAP);
      var y = BOARD_TOP + row * (CELL + GAP);

      // Fill
      var fill = ctx.createRadialGradient(x + CELL / 2, y, 0, x + CELL / 2, y, CELL);
      if (cell.free) {
        // The free tile stays grey on the page even when marked, so it does here too
        fill.addColorStop(0, "rgba(148,163,184,0.35)");
        fill.addColorStop(1, "#1f2937");
      } else if (cell.marked) {
        fill.addColorStop(0, "rgba(45,212,191,0.35)");
        fill.addColorStop(1, "#0f766e");
      } else {
        fill.addColorStop(0, "#162033");
        fill.addColorStop(1, "#0f172a");
      }
      roundRectPath(ctx, x, y, CELL, CELL, 16);
      ctx.fillStyle = fill;
      ctx.fill();

      // Border
      ctx.lineWidth = 2;
      if (cell.marked) markedCount++;
      if (cell.free) {
        ctx.strokeStyle = "rgba(148,163,184,0.8)";
        ctx.setLineDash(cell.marked ? [] : [8, 6]); // dashed until marked, as on the page
      } else if (cell.marked) {
        ctx.strokeStyle = "#14b8a6";
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "rgba(51,65,85,0.9)";
        ctx.setLineDash([]);
      }
      roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 15);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#e5e7eb";
      if (cell.free) {
        ctx.font = "700 26px " + FONT;
        ctx.fillText("FREE", x + CELL / 2, y + CELL / 2 - 10);
        ctx.font = "500 16px " + FONT;
        ctx.fillStyle = "#9ca3af";
        ctx.fillText("CENTER", x + CELL / 2, y + CELL / 2 + 18);
      } else {
        var fit = fitText(ctx, cell.label, CELL - 28, CELL - 28);
        ctx.font = "600 " + fit.size + "px " + FONT;
        var totalH = fit.lines.length * fit.lineHeight;
        var startY = y + CELL / 2 - totalH / 2 + fit.lineHeight / 2;
        fit.lines.forEach(function (line, li) {
          ctx.fillText(line, x + CELL / 2, startY + li * fit.lineHeight);
        });
      }
    });

    // Footer
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#14b8a6";
    ctx.font = "600 28px " + FONT;
    ctx.fillText(markedCount + " of 25 marked", PAD, BOARD_TOP + BOARD + 62);
    ctx.textAlign = "right";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "400 24px " + FONT;
    ctx.fillText(location.host + location.pathname, W - PAD, BOARD_TOP + BOARD + 62);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error("Could not create image"));
      }, "image/png");
    });
  }

  function setShareMsg(text) {
    shareMsg.textContent = text || "";
  }

  async function openShareDialog() {
    shareBtn.disabled = true;
    try {
      var canvas = renderCardCanvas(readCard());
      shareBlob = await canvasToBlob(canvas);

      if (shareUrl) URL.revokeObjectURL(shareUrl);
      shareUrl = URL.createObjectURL(shareBlob);
      shareImg.src = shareUrl;
      shareDownload.href = shareUrl;

      var file = new File([shareBlob], "vendor-bingo-card.png", { type: "image/png" });
      shareNative.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      shareCopy.hidden = !(navigator.clipboard && window.ClipboardItem);

      setShareMsg("");
      if (typeof shareDialog.showModal === "function") {
        shareDialog.showModal();
      } else {
        shareDialog.setAttribute("open", "");
      }
    } catch (err) {
      console.error(err);
      setStatus("Couldn't create the image: " + err.message, { error: true });
    } finally {
      shareBtn.disabled = false;
    }
  }

  shareBtn.addEventListener("click", openShareDialog);

  shareClose.addEventListener("click", function () {
    shareDialog.close();
  });

  // Click on the dimmed backdrop closes the dialog
  shareDialog.addEventListener("click", function (e) {
    if (e.target === shareDialog) shareDialog.close();
  });

  shareNative.addEventListener("click", async function () {
    try {
      var file = new File([shareBlob], "vendor-bingo-card.png", { type: "image/png" });
      await navigator.share({ files: [file], title: "Security Vendor Demo Bingo" });
    } catch (err) {
      if (err && err.name !== "AbortError") setShareMsg("Sharing failed. Try Download instead.");
    }
  });

  shareCopy.addEventListener("click", async function () {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob })]);
      setShareMsg("Image copied to your clipboard.");
    } catch (err) {
      console.error(err);
      setShareMsg("Couldn't copy. Try Download instead.");
    }
  });

  generateBtn.addEventListener("click", buildCard);

  fetchSquares();
})();
