(function () {
  var TZ = "Australia/Perth";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ymdInPerth(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function addDays(ymd, days) {
    var p = ymd.split("-").map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function dow(ymd) {
    var p = ymd.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function dayParts(ymd) {
    var p = ymd.split("-").map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    var weekday = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(dt);
    var day = new Intl.DateTimeFormat("en-AU", { day: "numeric", timeZone: "UTC" }).format(dt);
    var month = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(dt);
    return { weekday: weekday, day: day, month: month, label: weekday + " " + day + " " + month };
  }

  function storedTheme() {
    try {
      return localStorage.getItem("ozzy-theme");
    } catch (e) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try {
      localStorage.setItem("ozzy-theme", theme === "dark" ? "dark" : "light");
    } catch (e) {}
  }

  var initial = storedTheme();
  applyTheme(initial === "dark" || initial === "light" ? initial : systemTheme());

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var now = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(now);
    });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("target") === "_blank") return;
    var id = a.getAttribute("href").slice(1);
    if (!id) return;
    var el = id === "top" ? document.getElementById("top") || document.body : document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  function selectGroup(root, onChange) {
    if (!root) return;
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn || !root.contains(btn) || btn.disabled) return;
      root.querySelectorAll("button").forEach(function (b) {
        b.classList.remove("is-on");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-on");
      btn.setAttribute("aria-pressed", "true");
      if (onChange) onChange();
    });
  }

  var dayRoot = document.querySelector(".day-chips");
  if (dayRoot) {
    var today = ymdInPerth(new Date());
    var start = addDays(today, 1);
    var html = "";
    var firstOn = false;
    for (var i = 0; i < 14; i++) {
      var ymd = addDays(start, i);
      var w = dow(ymd);
      var parts = dayParts(ymd);
      var weekend = w === 0 || w === 6;
      var on = !weekend && !firstOn;
      if (on) firstOn = true;
      html +=
        '<button type="button" class="chip' +
        (on ? " is-on" : "") +
        '" data-day="' +
        ymd +
        '" data-dow="' +
        w +
        '" data-label="' +
        parts.label +
        '" aria-pressed="' +
        (on ? "true" : "false") +
        '"' +
        (weekend ? " disabled" : "") +
        "><span>" +
        parts.weekday +
        "</span><small>" +
        parts.day +
        " " +
        parts.month +
        "</small></button>";
    }
    dayRoot.innerHTML = html;
  }

  var summaryEl = document.getElementById("book-summary");
  function bookSummary() {
    var dayBtn = document.querySelector(".day-chips .is-on");
    var timeBtn = document.querySelector(".time-pills .is-on");
    var jobBtn = document.querySelector(".job-chips .is-on");
    var bits = [];
    if (dayBtn) bits.push(dayBtn.getAttribute("data-label"));
    if (timeBtn) bits.push(timeBtn.textContent.trim());
    if (jobBtn) bits.push(jobBtn.textContent.trim());
    if (summaryEl) {
      summaryEl.textContent = bits.length
        ? bits.join(" · ")
        : "Pick a day, a time window, and a job type.";
    }
    return bits.join(" · ");
  }

  selectGroup(dayRoot, bookSummary);
  selectGroup(document.querySelector(".time-pills"), bookSummary);
  selectGroup(document.querySelector(".job-chips"), bookSummary);
  bookSummary();

  var bookForm = document.querySelector(".book-form");
  var bookSuccess = document.getElementById("book-success");
  var bookError = document.getElementById("book-error");
  if (bookForm) {
    bookForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var dayBtn = document.querySelector(".day-chips .is-on");
      var timeBtn = document.querySelector(".time-pills .is-on");
      var jobBtn = document.querySelector(".job-chips .is-on");
      var name = (document.getElementById("b-name") || {}).value || "";
      var phone = (document.getElementById("b-phone") || {}).value || "";
      if (!dayBtn || !timeBtn || !jobBtn || !name.trim() || !phone.trim()) {
        if (bookError) {
          bookError.style.display = "block";
          bookError.textContent = "Choose a day, a time window, and a job type, and add your name and phone.";
        }
        return;
      }
      if (bookError) bookError.style.display = "none";
      bookForm.hidden = true;
      if (bookSuccess) {
        bookSuccess.classList.add("is-on");
        bookSuccess.hidden = false;
        var line = document.getElementById("book-success-line");
        if (line) line.textContent = "Visit request saved: " + bookSummary() + ".";
      }
    });
  }

  var quoteForm = document.querySelector(".quote-form");
  var quoteSuccess = document.getElementById("quote-success");
  if (quoteForm) {
    quoteForm.addEventListener("submit", function (e) {
      e.preventDefault();
      quoteForm.hidden = true;
      if (quoteSuccess) {
        quoteSuccess.classList.add("is-on");
        quoteSuccess.hidden = false;
      }
    });
  }
})();
