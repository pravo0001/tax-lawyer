const yearNode = document.querySelector("#year");
if (yearNode) {
  yearNode.textContent = new Date().getFullYear().toString();
}

const LEGACY_NAV_HREFS = new Map([
  ["index.html#focus", "directions.html"],
  ["./index.html#focus", "directions.html"],
  ["index.html#about", "about.html"],
  ["./index.html#about", "about.html"],
  ["index.html#process", "process.html"],
  ["./index.html#process", "process.html"],
  ["index.html#contact", "contact.html"],
  ["./index.html#contact", "contact.html"],
]);

document.querySelectorAll("a[href]").forEach((a) => {
  const href = a.getAttribute("href");
  if (!href) return;
  const next = LEGACY_NAV_HREFS.get(href.trim());
  if (next) {
    a.setAttribute("href", next);
  }
});

const form = document.querySelector("#consultation-form");
const note = document.querySelector("#form-note");
const phoneInput = form?.querySelector('input[name="phone"]');

const PHONE_PREFIX = "+380";
const TELEGRAM_BOT_TOKEN = "8556207665:AAF-6bJnbwQOREkA3jAqFiAVmqQTFumiUgY";
const TELEGRAM_CHAT_ID = "1262055797";
const SPAM_MIN_FILL_MS = 3500;
const SPAM_COOLDOWN_MS = 120000;
const LAST_SUBMIT_KEY = "consultation-last-submit-at";

const normalizeUaPhone = (raw) => {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("380")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 9);
  return `${PHONE_PREFIX}${digits}`;
};

const setPhoneCaretToEnd = (input) => {
  const end = input.value.length;
  requestAnimationFrame(() => {
    try {
      input.setSelectionRange(end, end);
    } catch {
      // ignore
    }
  });
};

if (phoneInput) {
  phoneInput.value = normalizeUaPhone(phoneInput.value);

  phoneInput.addEventListener("focus", () => {
    phoneInput.value = normalizeUaPhone(phoneInput.value);
    setPhoneCaretToEnd(phoneInput);
  });

  phoneInput.addEventListener("click", () => {
    if (phoneInput.selectionStart !== null && phoneInput.selectionStart < PHONE_PREFIX.length) {
      setPhoneCaretToEnd(phoneInput);
    }
  });

  phoneInput.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    if (phoneInput.selectionStart !== phoneInput.selectionEnd) return;

    if (event.key === "Backspace" && phoneInput.selectionStart <= PHONE_PREFIX.length) {
      event.preventDefault();
      setPhoneCaretToEnd(phoneInput);
    }

    if (event.key === "Delete" && phoneInput.selectionStart < PHONE_PREFIX.length) {
      event.preventDefault();
      setPhoneCaretToEnd(phoneInput);
    }
  });

  phoneInput.addEventListener("beforeinput", (event) => {
    if (event.inputType === "deleteContentBackward") {
      const start = phoneInput.selectionStart ?? 0;
      const end = phoneInput.selectionEnd ?? 0;
      if (start === end && start <= PHONE_PREFIX.length) {
        event.preventDefault();
      }
    }
  });

  phoneInput.addEventListener("input", () => {
    const prev = phoneInput.value;
    const next = normalizeUaPhone(prev);

    if (prev !== next) {
      phoneInput.value = next;
    }

    if ((phoneInput.selectionStart ?? 0) < PHONE_PREFIX.length) {
      setPhoneCaretToEnd(phoneInput);
    }
  });

  phoneInput.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") ?? "";
    phoneInput.value = normalizeUaPhone(pasted);
    setPhoneCaretToEnd(phoneInput);
  });
}

if (form && note) {
  const formStartAt = Date.now();

  const getLastSubmitAt = () => {
    try {
      const raw = localStorage.getItem(LAST_SUBMIT_KEY);
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const setLastSubmitAt = (timestamp) => {
    try {
      localStorage.setItem(LAST_SUBMIT_KEY, String(timestamp));
    } catch {
      // ignore
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nameInput = form.querySelector('input[name="name"]');
    const phoneField = form.querySelector('input[name="phone"]');
    const messageField = form.querySelector('textarea[name="message"]');
    const websiteField = form.querySelector('input[name="website"]');

    const name = (nameInput instanceof HTMLInputElement ? nameInput.value : "").trim();
    const phone = (phoneField instanceof HTMLInputElement ? phoneField.value : "").trim();
    const message = (messageField instanceof HTMLTextAreaElement ? messageField.value : "").trim();
    const website = (websiteField instanceof HTMLInputElement ? websiteField.value : "").trim();

    if (website) {
      note.textContent = "Не вдалося надіслати заявку. Спробуйте ще раз.";
      return;
    }

    const now = Date.now();
    const filledTooFast = now - formStartAt < SPAM_MIN_FILL_MS;
    if (filledTooFast) {
      note.textContent = "Заявка відправлена занадто швидко. Будь ласка, повторіть через кілька секунд.";
      return;
    }

    const lastSubmitAt = getLastSubmitAt();
    const msLeft = lastSubmitAt + SPAM_COOLDOWN_MS - now;
    if (msLeft > 0) {
      const secLeft = Math.ceil(msLeft / 1000);
      note.textContent = `Зачекайте ${secLeft} с перед наступною заявкою.`;
      return;
    }

    if (/https?:\/\/|www\./i.test(message)) {
      note.textContent = "Будь ласка, приберіть посилання з повідомлення і спробуйте ще раз.";
      return;
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      note.textContent = "Форма не налаштована: додайте токен Telegram-бота та chat id у script.js.";
      return;
    }

    note.textContent = "Надсилаємо заявку...";

    const text = [
      "Нова заявка на консультацію",
      `Ім'я: ${name || "-"}`,
      `Телефон: ${phone || "-"}`,
      `Ситуація: ${message || "-"}`,
      `Сторінка: ${window.location.href}`,
      `Час: ${new Date().toLocaleString("uk-UA")}`,
    ].join("\n");

    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const description = payload && typeof payload === "object" && "description" in payload
          ? String(payload.description)
          : "Telegram API error";
        throw new Error(description);
      }

      note.textContent = "Дякуємо! Заявку отримано. Ми зв'яжемося з вами найближчим часом.";
      setLastSubmitAt(Date.now());
      form.reset();
      if (phoneInput) {
        phoneInput.value = PHONE_PREFIX;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "невідома помилка";
      note.textContent = `Не вдалося надіслати заявку: ${reason}.`;
    }
  });
}

const THEME_KEY = "site-theme";
const body = document.body;
const themeToggle = document.querySelector("#theme-toggle");

const applyTheme = (theme) => {
  const next = theme === "night" ? "night" : "day";
  body.classList.remove("theme-day", "theme-night");
  body.classList.add(next === "night" ? "theme-night" : "theme-day");

  if (themeToggle) {
    const isNight = next === "night";
    themeToggle.textContent = isNight ? "☼" : "☾";
    themeToggle.setAttribute("aria-pressed", isNight ? "true" : "false");
    themeToggle.setAttribute("aria-label", isNight ? "Увімкнути денну тему" : "Увімкнути нічну тему");
    themeToggle.setAttribute("title", isNight ? "Увімкнути денну тему" : "Увімкнути нічну тему");
  }

  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
};

const initialTheme = (() => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "night" || saved === "day") return saved;
  } catch {
    // ignore
  }
  return body.classList.contains("theme-night") ? "night" : "day";
})();

applyTheme(initialTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isNight = body.classList.contains("theme-night");
    applyTheme(isNight ? "day" : "night");
  });
}

const menuToggle = document.querySelector(".menu-toggle");
const menu = document.querySelector(".menu");

if (menuToggle && menu) {
  const closeMenu = () => {
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.classList.add("is-open");
    menuToggle.setAttribute("aria-expanded", "true");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menu.classList.contains("is-open");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!menu.contains(target) && !menuToggle.contains(target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  const media = window.matchMedia("(min-width: 921px)");
  const onMediaChange = () => {
    if (media.matches) closeMenu();
  };

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onMediaChange);
  } else if (typeof media.addListener === "function") {
    media.addListener(onMediaChange);
  }
}