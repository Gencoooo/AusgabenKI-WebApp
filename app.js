(() => {
  "use strict";

  const STORAGE_KEY = "ausgaben-ki-v1";
  const THEME_KEY = "ausgaben-ki-theme";
  const BACKUP_FORMAT = "ausgaben-ki-backup";
  const BACKUP_VERSION = 1;
  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
  const DEFAULT_EUR_TO_CHF = 0.94;
  const EUR_RATE_ENDPOINT = "https://api.frankfurter.dev/v2/providers/ecb/rate/eur/chf";
  const EUR_RATE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

  const categories = {
    lebensmittel: { label: "Lebensmittel", icon: "🛒", color: "#58d6a6" },
    essen: { label: "Essen auswärts", icon: "🍽️", color: "#ffab66" },
    wohnen: { label: "Wohnen", icon: "🏠", color: "#6f9cff" },
    versicherung: { label: "Versicherung", icon: "🛡️", color: "#b787f5" },
    transport: { label: "Transport", icon: "🚋", color: "#54c4e8" },
    studium: { label: "Studium", icon: "📚", color: "#ffd166" },
    gesundheit: { label: "Gesundheit & Fitness", icon: "💪", color: "#ff7485" },
    kommunikation: { label: "Handy & Internet", icon: "📱", color: "#7dd3fc" },
    abos: { label: "Abos", icon: "▶️", color: "#f68ad4" },
    shopping: { label: "Shopping", icon: "🛍️", color: "#f09a68" },
    freizeit: { label: "Freizeit", icon: "🎮", color: "#9c91ff" },
    steuern: { label: "Steuern & Gebühren", icon: "🧾", color: "#93a4b8" },
    sonstiges: { label: "Sonstiges", icon: "•••", color: "#8291a6" }
  };

  const cadences = {
    standard: { label: "Normal", months: 0 },
    semiannual: { label: "Halbjährlich", months: 6 },
    annual: { label: "Jährlich", months: 12 }
  };

  const seedExamples = {
    lebensmittel: ["coop einkauf", "migros lebensmittel", "aldi", "lidl", "denner", "volg", "spar supermarkt", "banane milch brot", "fleisch gemüse", "protein pulver whey", "magerquark skyr"],
    essen: ["restaurant", "mcdonalds", "burger king", "döner kebab", "take away", "uber eats", "just eat", "kaffee café", "bäckerei gipfeli", "mittagessen kantine"],
    wohnen: ["miete nebenkosten", "stromrechnung", "iwb energie", "haushalt möbel", "ikea", "reinigung wohnung"],
    versicherung: ["krankenkasse kpt", "sanitas", "axa versicherung", "hausrat", "haftpflicht", "prämie versicherung"],
    transport: ["sbb billet", "u abo", "tnw", "tram bus", "benzin tankstelle", "shell", "avia", "parking parkhaus", "motorrad roller", "uber fahrt"],
    studium: ["ags basel schulgeld", "hf semester", "schulbuch", "kurs prüfung", "student ausbildung", "ti nspire taschenrechner"],
    gesundheit: ["apotheke", "arzt", "zahnarzt", "kontaktlinsen", "brille", "fitness abo", "gym", "medikamente", "massage"],
    kommunikation: ["swisscom", "salt mobile", "sunrise", "yallo", "handy rechnung", "internet rechnung", "sim karte"],
    abos: ["netflix", "spotify", "youtube premium", "icloud", "chatgpt plus", "amazon prime", "adobe abo", "app store abonnement"],
    shopping: ["galaxus", "digitec", "amazon bestellung", "zalando", "kleider schuhe", "interdiscount", "mediamarkt", "temu"],
    freizeit: ["kino", "game spiel", "playstation", "steam", "ferien hotel", "freizeit ausflug", "konzert", "hobbygarten"],
    steuern: ["steuern basel", "steuerverwaltung", "gebühr amt", "ausweis gebühr", "busse", "mahngebühr"],
    sonstiges: ["sonstiges", "unbekannt", "bar bezahlt"]
  };

  const state = loadState();
  let currentPrediction = { category: "sonstiges", confidence: 0 };
  let analysisMode = "month";
  let analysisScope = "regular";
  let analysisAnchor = todayISO();
  let selectedAnalysisCategory = null;
  let currentTrendData = [];
  let toastTimer;
  let rateRefreshInFlight = false;

  const els = {
    form: document.querySelector("#expenseForm"),
    description: document.querySelector("#description"),
    amount: document.querySelector("#amount"),
    currency: document.querySelector("#currency"),
    exchangeRate: document.querySelector("#exchangeRate"),
    exchangeRateField: document.querySelector("#exchangeRateField"),
    rateStatus: document.querySelector("#rateStatus"),
    refreshRate: document.querySelector("#refreshRate"),
    date: document.querySelector("#expenseDate"),
    category: document.querySelector("#category"),
    cadence: document.querySelector("#cadence"),
    prediction: document.querySelector("#prediction"),
    predictionText: document.querySelector("#predictionText"),
    recentList: document.querySelector("#recentList"),
    expenseList: document.querySelector("#expenseList"),
    monthTotal: document.querySelector("#monthTotal"),
    monthCount: document.querySelector("#monthCount"),
    topCategory: document.querySelector("#topCategory"),
    currentMonthLabel: document.querySelector("#currentMonthLabel"),
    categoryFilter: document.querySelector("#categoryFilter"),
    sortOrder: document.querySelector("#sortOrder"),
    previousPeriod: document.querySelector("#previousPeriod"),
    nextPeriod: document.querySelector("#nextPeriod"),
    periodLabel: document.querySelector("#periodLabel"),
    analysisTotalLabel: document.querySelector("#analysisTotalLabel"),
    analysisTotal: document.querySelector("#analysisTotal"),
    analysisForeignTotal: document.querySelector("#analysisForeignTotal"),
    analysisCount: document.querySelector("#analysisCount"),
    analysisComparison: document.querySelector("#analysisComparison"),
    analysisDailyAverage: document.querySelector("#analysisDailyAverage"),
    analysisBookingMetric: document.querySelector("#analysisBookingMetric"),
    analysisLargestMetric: document.querySelector("#analysisLargestMetric"),
    trendChart: document.querySelector("#trendChart"),
    trendLabels: document.querySelector("#trendLabels"),
    trendFocus: document.querySelector("#trendFocus"),
    donutChart: document.querySelector("#donutChart"),
    donutTotal: document.querySelector("#donutTotal"),
    chartLegend: document.querySelector("#chartLegend"),
    categoryDetailCard: document.querySelector("#categoryDetailCard"),
    categoryDetailIcon: document.querySelector("#categoryDetailIcon"),
    categoryDetailTitle: document.querySelector("#categoryDetailTitle"),
    categoryDetailAmount: document.querySelector("#categoryDetailAmount"),
    categoryDetailForeign: document.querySelector("#categoryDetailForeign"),
    categoryDetailShare: document.querySelector("#categoryDetailShare"),
    categoryDetailAverage: document.querySelector("#categoryDetailAverage"),
    categoryDetailCount: document.querySelector("#categoryDetailCount"),
    categoryDetailList: document.querySelector("#categoryDetailList"),
    budgetPeriodHint: document.querySelector("#budgetPeriodHint"),
    budgetEmpty: document.querySelector("#budgetEmpty"),
    budgetContent: document.querySelector("#budgetContent"),
    budgetTotal: document.querySelector("#budgetTotal"),
    budgetRemainingLabel: document.querySelector("#budgetRemainingLabel"),
    budgetRemaining: document.querySelector("#budgetRemaining"),
    budgetProgress: document.querySelector("#budgetProgress"),
    budgetStatusText: document.querySelector("#budgetStatusText"),
    budgetRows: document.querySelector("#budgetRows"),
    periodicCount: document.querySelector("#periodicCount"),
    periodicEmpty: document.querySelector("#periodicEmpty"),
    periodicContent: document.querySelector("#periodicContent"),
    periodicPaid: document.querySelector("#periodicPaid"),
    periodicPaidForeign: document.querySelector("#periodicPaidForeign"),
    periodicReserve: document.querySelector("#periodicReserve"),
    periodicReserveForeign: document.querySelector("#periodicReserveForeign"),
    periodicList: document.querySelector("#periodicList"),
    largestExpenses: document.querySelector("#largestExpenses"),
    insightList: document.querySelector("#insightList"),
    forecastCard: document.querySelector("#forecastCard"),
    forecastHint: document.querySelector("#forecastHint"),
    forecastDays: document.querySelector("#forecastDays"),
    forecastTotal: document.querySelector("#forecastTotal"),
    forecastText: document.querySelector("#forecastText"),
    forecastSpent: document.querySelector("#forecastSpent"),
    forecastBudgetMark: document.querySelector("#forecastBudgetMark"),
    forecastSoFar: document.querySelector("#forecastSoFar"),
    forecastDailyLabel: document.querySelector("#forecastDailyLabel"),
    forecastDaily: document.querySelector("#forecastDaily"),
    changesHint: document.querySelector("#changesHint"),
    changesList: document.querySelector("#changesList"),
    editDialog: document.querySelector("#editDialog"),
    editId: document.querySelector("#editId"),
    editTitle: document.querySelector("#editTitle"),
    editAmount: document.querySelector("#editAmount"),
    editCurrency: document.querySelector("#editCurrency"),
    editExchangeRate: document.querySelector("#editExchangeRate"),
    editExchangeRateField: document.querySelector("#editExchangeRateField"),
    editCategory: document.querySelector("#editCategory"),
    editCadence: document.querySelector("#editCadence"),
    budgetDialog: document.querySelector("#budgetDialog"),
    budgetInputs: document.querySelector("#budgetInputs"),
    toast: document.querySelector("#toast"),
    themeButton: document.querySelector("#themeButton"),
    exportBackup: document.querySelector("#exportBackup"),
    importBackup: document.querySelector("#importBackup"),
    backupFile: document.querySelector("#backupFile")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const savedRate = parseRate(saved?.settings?.eurToChfRate) || DEFAULT_EUR_TO_CHF;
      return {
        expenses: Array.isArray(saved?.expenses)
          ? saved.expenses.map(expense => {
              const currency = expense.currency === "EUR" ? "EUR" : "CHF";
              const originalAmount = parseAmount(expense.originalAmount) || parseAmount(expense.amount) || 0;
              const exchangeRate = currency === "EUR" ? (parseRate(expense.exchangeRate) || savedRate) : 1;
              return {
                ...expense,
                amount: parseAmount(expense.amount) || (currency === "EUR" ? Math.round(originalAmount * exchangeRate * 100) / 100 : originalAmount),
                originalAmount,
                currency,
                exchangeRate,
                cadence: cadences[expense.cadence] ? expense.cadence : "standard"
              };
            })
          : [],
        learned: Array.isArray(saved?.learned) ? saved.learned : [],
        budgets: saved?.budgets && typeof saved.budgets === "object" ? saved.budgets : {},
        settings: {
          eurToChfRate: savedRate,
          eurRateUpdatedAt: typeof saved?.settings?.eurRateUpdatedAt === "string" ? saved.settings.eurRateUpdatedAt : null,
          eurRateSourceDate: typeof saved?.settings?.eurRateSourceDate === "string" ? saved.settings.eurRateSourceDate : null
        }
      };
    } catch {
      return { expenses: [], learned: [], budgets: {}, settings: { eurToChfRate: DEFAULT_EUR_TO_CHF, eurRateUpdatedAt: null, eurRateSourceDate: null } };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createBackupPayload() {
    return {
      app: "Ausgaben KI",
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      storage: {
        [STORAGE_KEY]: localStorage.getItem(STORAGE_KEY) || JSON.stringify(state),
        [THEME_KEY]: localStorage.getItem(THEME_KEY) || "dark"
      }
    };
  }

  function exportBackup() {
    persist();
    const blob = new Blob([JSON.stringify(createBackupPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AusgabenKI-Backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${state.expenses.length} ${state.expenses.length === 1 ? "Ausgabe" : "Ausgaben"} gesichert`);
  }

  function normalizeImportedState(rawState) {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) throw new Error("Ungültige Ausgaben-Daten");
    if (!Array.isArray(rawState.expenses)) throw new Error("Backup enthält keine gültige Ausgabenliste");
    if (rawState.learned != null && !Array.isArray(rawState.learned)) throw new Error("Ungültige KI-Lernregeln im Backup");
    if (rawState.budgets != null && (typeof rawState.budgets !== "object" || Array.isArray(rawState.budgets))) throw new Error("Ungültige Budgets im Backup");

    const fallbackRate = parseRate(rawState.settings?.eurToChfRate) || DEFAULT_EUR_TO_CHF;
    const expenses = rawState.expenses.map((expense, index) => {
      if (!expense || typeof expense !== "object" || Array.isArray(expense)) throw new Error(`Ungültige Ausgabe an Position ${index + 1}`);
      const description = String(expense.description || "").trim().slice(0, 80);
      const amount = parseAmount(expense.amount);
      const date = String(expense.date || "");
      if (!description || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Unvollständige Ausgabe an Position ${index + 1}`);
      const currency = expense.currency === "EUR" ? "EUR" : "CHF";
      const exchangeRate = currency === "EUR" ? (parseRate(expense.exchangeRate) || fallbackRate) : 1;
      const originalAmount = currency === "EUR"
        ? (parseAmount(expense.originalAmount) || Math.round(amount / exchangeRate * 100) / 100)
        : amount;
      const category = categories[expense.category] ? expense.category : "sonstiges";
      return {
        id: typeof expense.id === "string" && expense.id ? expense.id : `import-${Date.now()}-${index}`,
        description,
        amount,
        originalAmount,
        currency,
        exchangeRate,
        date,
        category,
        cadence: cadences[expense.cadence] ? expense.cadence : "standard",
        predictedCategory: categories[expense.predictedCategory] ? expense.predictedCategory : category,
        createdAt: Number.isFinite(Number(expense.createdAt)) ? Number(expense.createdAt) : Date.now() + index
      };
    });

    const learned = (rawState.learned || [])
      .filter(row => row && typeof row.text === "string" && row.text.trim() && categories[row.category])
      .map(row => ({ text: row.text.trim().slice(0, 80), category: row.category }));
    const budgets = {};
    Object.entries(rawState.budgets || {}).forEach(([key, value]) => {
      const amount = parseAmount(value);
      if (categories[key] && amount) budgets[key] = amount;
    });

    return {
      expenses,
      learned,
      budgets,
      settings: {
        eurToChfRate: fallbackRate,
        eurRateUpdatedAt: typeof rawState.settings?.eurRateUpdatedAt === "string" ? rawState.settings.eurRateUpdatedAt : null,
        eurRateSourceDate: typeof rawState.settings?.eurRateSourceDate === "string" ? rawState.settings.eurRateSourceDate : null
      }
    };
  }

  async function importBackupFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup ist zu gross");
      const payload = JSON.parse(await file.text());
      if (payload?.format !== BACKUP_FORMAT || !payload?.storage || typeof payload.storage !== "object") {
        throw new Error("Diese Datei ist kein Ausgaben-KI-Backup");
      }
      if (!Number.isInteger(payload.version) || payload.version < 1 || payload.version > BACKUP_VERSION) {
        throw new Error("Diese Backup-Version wird nicht unterstützt");
      }
      const storedState = payload.storage[STORAGE_KEY];
      const parsedState = typeof storedState === "string" ? JSON.parse(storedState) : storedState;
      const importedState = normalizeImportedState(parsedState);
      const count = importedState.expenses.length;
      const existingCount = state.expenses.length;
      const question = existingCount
        ? `Importieren? Deine aktuell ${existingCount} gespeicherten Ausgaben auf diesem Gerät werden durch ${count} Ausgaben aus dem Backup ersetzt.`
        : `Backup mit ${count} Ausgaben importieren?`;
      if (!window.confirm(question)) return;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(importedState));
      const theme = payload.storage[THEME_KEY];
      if (theme === "light" || theme === "dark") localStorage.setItem(THEME_KEY, theme);
      window.location.reload();
    } catch (error) {
      showToast(error?.message || "Backup konnte nicht importiert werden");
    } finally {
      els.backupFile.value = "";
    }
  }

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function monthKey(dateString) { return String(dateString).slice(0, 7); }

  function dateFromISO(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function dateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function startOfPeriod(mode, date) {
    const start = new Date(date);
    if (mode === "week") {
      const offset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - offset);
    } else if (mode === "month") {
      start.setDate(1);
    } else {
      start.setMonth(0, 1);
    }
    return start;
  }

  function endOfPeriod(mode, start) {
    if (mode === "week") return addDays(start, 6);
    if (mode === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
    return new Date(start.getFullYear(), 11, 31, 12);
  }

  function shiftPeriod(date, mode, amount) {
    const shifted = new Date(date);
    if (mode === "week") shifted.setDate(shifted.getDate() + amount * 7);
    else if (mode === "month") shifted.setMonth(shifted.getMonth() + amount, 1);
    else shifted.setFullYear(shifted.getFullYear() + amount, 0, 1);
    return shifted;
  }

  function periodBounds(mode, anchorISO) {
    const start = startOfPeriod(mode, dateFromISO(anchorISO));
    return { start, end: endOfPeriod(mode, start) };
  }

  function isInBounds(dateString, bounds) {
    const date = dateFromISO(dateString);
    return date >= bounds.start && date <= bounds.end;
  }

  function daysInclusive(start, end) {
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function periodText(mode, bounds) {
    if (mode === "year") return String(bounds.start.getFullYear());
    if (mode === "month") return new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(bounds.start);
    const start = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short" }).format(bounds.start);
    const end = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short", year: "numeric" }).format(bounds.end);
    return `${start} – ${end}`;
  }

  // Laufende Periode: Vergleich nur mit dem gleichen Zeitraum der Vorperiode (z. B. 1.–9. des Vormonats)
  function comparablePreviousBounds(mode, bounds, previousBounds) {
    const today = dateFromISO(todayISO());
    if (today < bounds.start || today > bounds.end) return { ...previousBounds, partial: false };
    let end;
    if (mode === "week") {
      end = addDays(previousBounds.start, daysInclusive(bounds.start, today) - 1);
    } else {
      const year = previousBounds.start.getFullYear();
      const month = mode === "month" ? previousBounds.start.getMonth() : today.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      end = new Date(year, month, Math.min(today.getDate(), lastDay), 12);
    }
    if (end >= previousBounds.end) return { ...previousBounds, partial: false };
    return { start: previousBounds.start, end, partial: true };
  }

  function previousPeriodPhrases(mode, comparison) {
    if (comparison?.partial) {
      const format = date => new Intl.DateTimeFormat("de-CH", mode === "week" ? { weekday: "short" } : { day: "numeric", month: "short" }).format(date).replace(/\.$/, "");
      const range = `${format(comparison.start)} – ${format(comparison.end)}`;
      if (mode === "week") return { during: "im gleichen Zeitraum der Vorwoche", source: "aus dem gleichen Zeitraum der Vorwoche", compared: `gegenüber der Vorwoche (${range})` };
      if (mode === "year") return { during: "im gleichen Zeitraum des Vorjahres", source: "aus dem gleichen Zeitraum des Vorjahres", compared: `gegenüber dem Vorjahr (${range})` };
      return { during: "im gleichen Zeitraum des Vormonats", source: "aus dem gleichen Zeitraum des Vormonats", compared: `gegenüber dem Vormonat (${range})` };
    }
    if (mode === "week") return { during: "in der Vorwoche", source: "aus der Vorwoche", compared: "gegenüber der Vorwoche" };
    if (mode === "year") return { during: "im Vorjahr", source: "aus dem Vorjahr", compared: "gegenüber dem Vorjahr" };
    return { during: "im Vormonat", source: "aus dem Vormonat", compared: "gegenüber dem Vormonat" };
  }

  function tokenize(value) {
    return String(value)
      .toLocaleLowerCase("de-CH")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9äöüß]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(token => token.length > 1 && !/^\d+$/.test(token));
  }

  function trainingRows() {
    const rows = [];
    Object.entries(seedExamples).forEach(([category, examples]) => {
      examples.forEach(text => rows.push({ text, category, weight: 1 }));
    });
    state.learned.forEach(row => rows.push({ ...row, weight: 3 }));
    return rows;
  }

  function predictCategory(text) {
    const tokens = tokenize(text);
    if (!tokens.length) return { category: "sonstiges", confidence: 0 };

    const rows = trainingRows();
    const vocabulary = new Set();
    const model = {};
    Object.keys(categories).forEach(key => { model[key] = { documents: 0, tokens: {}, total: 0 }; });

    rows.forEach(row => {
      const rowTokens = tokenize(row.text);
      const weight = row.weight || 1;
      model[row.category].documents += weight;
      rowTokens.forEach(token => {
        vocabulary.add(token);
        model[row.category].tokens[token] = (model[row.category].tokens[token] || 0) + weight;
        model[row.category].total += weight;
      });
    });

    const totalDocuments = rows.reduce((sum, row) => sum + (row.weight || 1), 0);
    const scores = Object.keys(categories).map(category => {
      const bucket = model[category];
      let score = Math.log((bucket.documents + 1) / (totalDocuments + Object.keys(categories).length));
      tokens.forEach(token => {
        score += Math.log(((bucket.tokens[token] || 0) + 1) / (bucket.total + vocabulary.size));
      });
      return { category, score };
    }).sort((a, b) => b.score - a.score);

    const top = scores[0];
    const runnerUp = scores[1];
    const gap = Math.max(0, top.score - runnerUp.score);
    const confidence = Math.min(96, Math.round(48 + gap * 18));
    return { category: top.category, confidence };
  }

  function learn(text, category) {
    const clean = String(text).trim();
    if (!clean || !categories[category]) return;
    const duplicate = state.learned.find(row => row.text.toLocaleLowerCase("de-CH") === clean.toLocaleLowerCase("de-CH") && row.category === category);
    if (!duplicate) state.learned.push({ text: clean, category });
  }

  function parseAmount(value) {
    const normalized = String(value).trim().replace(/\s/g, "").replace(/'/g, "").replace(",", ".");
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
  }

  function parseRate(value) {
    const normalized = String(value).trim().replace(/\s/g, "").replace(/'/g, "").replace(",", ".");
    const rate = Number.parseFloat(normalized);
    return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 1000000) / 1000000 : null;
  }

  function money(amount) {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", minimumFractionDigits: 2 }).format(amount);
  }

  function euroMoney(amount) {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(amount);
  }

  function euroOriginalTotal(expenses) {
    return expenses
      .filter(expense => expense.currency === "EUR")
      .reduce((sum, expense) => sum + (parseAmount(expense.originalAmount) || 0), 0);
  }

  function setSecondaryCurrency(element, amount, prefix = "davon") {
    const visible = Number(amount) > 0;
    element.hidden = !visible;
    element.textContent = visible ? `${prefix} ${euroMoney(amount)} original` : "";
  }

  function shortMoney(amount) {
    return new Intl.NumberFormat("de-CH", { maximumFractionDigits: amount >= 1000 ? 0 : 2 }).format(amount);
  }

  function monthLabel(key, format = "long") {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("de-CH", { month: format, year: "numeric" }).format(new Date(year, month - 1, 1));
  }

  function dateLabel(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const today = todayISO();
    if (dateString === today) return "Heute";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = new Date(yesterday.getTime() - yesterday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (dateString === yesterdayISO) return "Gestern";
    return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "short" }).format(date);
  }

  function fillCategorySelect(select, includeAll = false) {
    const selected = select.value;
    const options = includeAll ? '<option value="all">Alle Kategorien</option>' : "";
    select.innerHTML = options + Object.entries(categories).map(([key, item]) => `<option value="${key}">${item.icon} ${item.label}</option>`).join("");
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function emptyState(title, copy, icon = "✦") {
    return `<div class="empty-state"><span>${icon}</span><strong>${title}</strong><p>${copy}</p></div>`;
  }

  function expenseMarkup(expense) {
    const category = categories[expense.category] || categories.sonstiges;
    const cadence = cadences[expense.cadence] || cadences.standard;
    const cadenceText = expense.cadence && expense.cadence !== "standard" ? ` · <b class="cadence-tag">${cadence.label}</b>` : "";
    const originalCurrency = expense.currency === "EUR"
      ? `<small class="original-currency">${euroMoney(expense.originalAmount)} · Kurs ${Number(expense.exchangeRate).toFixed(4)}</small>`
      : "";
    return `<button class="expense-item" type="button" data-edit-id="${expense.id}" style="--cat-color:${category.color}">
      <span class="category-icon">${category.icon}</span>
      <span class="expense-copy"><strong>${escapeHtml(expense.description)}</strong><span>${dateLabel(expense.date)}${cadenceText}</span></span>
      <span class="expense-amount"><strong>${money(expense.amount)}</strong>${originalCurrency}<span class="category-pill">${category.label}</span></span>
    </button>`;
  }

  function totalsByCategory(expenses) {
    return expenses.reduce((totals, expense) => {
      totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
      return totals;
    }, {});
  }

  function renderCapture() {
    const nowMonth = todayISO().slice(0, 7);
    const expenses = state.expenses.filter(expense => monthKey(expense.date) === nowMonth);
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const categoryTotals = totalsByCategory(expenses);
    const top = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

    els.monthTotal.textContent = money(total);
    els.monthCount.textContent = String(expenses.length);
    els.topCategory.textContent = top ? categories[top[0]]?.label || "Sonstiges" : "—";
    els.currentMonthLabel.textContent = monthLabel(nowMonth, "short");

    const recent = [...state.expenses].sort(sortNewest).slice(0, 3);
    els.recentList.innerHTML = recent.length
      ? recent.map(expenseMarkup).join("")
      : emptyState("Noch keine Ausgabe", "Deine erste gespeicherte Ausgabe erscheint hier.", "＋");
  }

  function sortNewest(a, b) {
    return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
  }

  function renderExpenses() {
    let expenses = [...state.expenses];
    if (els.categoryFilter.value !== "all") expenses = expenses.filter(expense => expense.category === els.categoryFilter.value);

    if (els.sortOrder.value === "highest") expenses.sort((a, b) => b.amount - a.amount);
    else if (els.sortOrder.value === "category") expenses.sort((a, b) => categories[a.category].label.localeCompare(categories[b.category].label, "de") || sortNewest(a, b));
    else expenses.sort(sortNewest);

    els.expenseList.innerHTML = expenses.length
      ? expenses.map(expenseMarkup).join("")
      : emptyState(state.expenses.length ? "Keine Treffer" : "Noch keine Ausgaben", state.expenses.length ? "Wähle eine andere Kategorie." : "Erfasse zuerst eine Ausgabe.", "⌁");
  }

  function expensesInPeriod(bounds) {
    return state.expenses.filter(expense => isInBounds(expense.date, bounds));
  }

  function trendBuckets(mode, bounds, expenses) {
    const buckets = [];
    const addBucket = (start, end, label, detail) => {
      const rows = expenses.filter(expense => {
          const date = dateFromISO(expense.date);
          return date >= start && date <= end;
        });
      const value = rows.reduce((sum, expense) => sum + expense.amount, 0);
      buckets.push({ value, euro: euroOriginalTotal(rows), label, detail });
    };

    if (mode === "year") {
      for (let month = 0; month < 12; month += 1) {
        const start = new Date(bounds.start.getFullYear(), month, 1, 12);
        const end = new Date(bounds.start.getFullYear(), month + 1, 0, 12);
        addBucket(start, end,
          new Intl.DateTimeFormat("de-CH", { month: "short" }).format(start).replace(".", ""),
          new Intl.DateTimeFormat("de-CH", { month: "long", year: "numeric" }).format(start));
      }
      return buckets;
    }

    const count = daysInclusive(bounds.start, bounds.end);
    for (let index = 0; index < count; index += 1) {
      const date = addDays(bounds.start, index);
      const label = mode === "week"
        ? new Intl.DateTimeFormat("de-CH", { weekday: "short" }).format(date).replace(".", "")
        : String(date.getDate());
      const detail = new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "numeric", month: "short" }).format(date);
      addBucket(date, date, label, detail);
    }
    return buckets;
  }

  function renderTrend(current, previous, total) {
    currentTrendData = current;
    const width = 340;
    const height = 140;
    const padX = 12;
    const padTop = 12;
    const padBottom = 16;
    const max = Math.max(1, ...current.map(point => point.value), ...previous.map(point => point.value));
    const pointCoordinates = series => series.map((point, index) => {
      const x = series.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (series.length - 1));
      const y = padTop + (1 - point.value / max) * (height - padTop - padBottom);
      return { ...point, x, y, index };
    });
    const currentPoints = pointCoordinates(current);
    const previousPoints = pointCoordinates(previous);
    const line = points => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const baseY = height - padBottom;
    const area = currentPoints.length ? `${line(currentPoints)} L${currentPoints.at(-1).x.toFixed(1)} ${baseY} L${currentPoints[0].x.toFixed(1)} ${baseY} Z` : "";
    const grid = [0.25, 0.5, 0.75, 1].map(step => `<line class="trend-grid" x1="${padX}" y1="${(padTop + step * (height - padTop - padBottom)).toFixed(1)}" x2="${width - padX}" y2="${(padTop + step * (height - padTop - padBottom)).toFixed(1)}"></line>`).join("");
    const dots = currentPoints
      .filter(point => current.length <= 12 || point.value > 0)
      .map(point => `<circle class="trend-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.7" tabindex="0" role="button" data-trend-index="${point.index}" aria-label="${escapeHtml(point.detail)}: ${escapeHtml(money(point.value))}${point.euro ? `, davon ${escapeHtml(euroMoney(point.euro))} original` : ""}"></circle>`)
      .join("");

    els.trendChart.innerHTML = `<defs><linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".24"></stop><stop offset="1" stop-color="var(--primary)" stop-opacity="0"></stop></linearGradient></defs>${grid}${area ? `<path class="trend-area" d="${area}"></path>` : ""}${previousPoints.length ? `<path class="trend-line previous" d="${line(previousPoints)}"></path>` : ""}${currentPoints.length ? `<path class="trend-line current" d="${line(currentPoints)}"></path>` : ""}${dots}`;
    const euro = current.reduce((sum, point) => sum + (point.euro || 0), 0);
    els.trendFocus.textContent = `Gesamt: ${money(total)}${euro ? ` · ${euroMoney(euro)} original` : ""}`;

    const labelPoints = current.length <= 12
      ? current
      : [current[0], current[7], current[14], current[21], current.at(-1)];
    els.trendLabels.style.setProperty("--label-count", String(labelPoints.length || 1));
    els.trendLabels.innerHTML = labelPoints.map(point => `<span>${escapeHtml(point.label)}</span>`).join("");
  }

  function showTrendPoint(index) {
    const point = currentTrendData[Number(index)];
    if (!point) return;
    els.trendFocus.textContent = `${point.detail}: ${money(point.value)}${point.euro ? ` · ${euroMoney(point.euro)} original` : ""}`;
  }

  function budgetScale(mode) {
    if (mode === "week") return 7 / (365.25 / 12);
    if (mode === "year") return 12;
    return 1;
  }

  function progressTone(ratio) {
    if (ratio > 1) return "over";
    if (ratio >= 0.8) return "warning";
    return "";
  }

  function renderBudget(expenses) {
    const configured = Object.entries(state.budgets)
      .filter(([key, value]) => categories[key] && Number(value) > 0);
    els.budgetPeriodHint.textContent = analysisMode === "week" ? "Anteilige Wochenbudgets" : analysisMode === "year" ? "Jahreswerte aus Monatsbudgets" : "Monatsbudgets";
    els.budgetEmpty.hidden = configured.length > 0;
    els.budgetContent.hidden = configured.length === 0;
    if (!configured.length) return [];

    const factor = budgetScale(analysisMode);
    const periodBudget = configured.reduce((sum, [, value]) => sum + Number(value) * factor, 0);
    const configuredKeys = new Set(configured.map(([key]) => key));
    const trackedSpent = expenses.filter(expense => configuredKeys.has(expense.category)).reduce((sum, expense) => sum + expense.amount, 0);
    const remaining = periodBudget - trackedSpent;
    const ratio = periodBudget > 0 ? trackedSpent / periodBudget : 0;
    const tone = progressTone(ratio);
    els.budgetTotal.textContent = money(periodBudget);
    els.budgetRemainingLabel.textContent = remaining >= 0 ? "Verfügbar" : "Überschritten";
    els.budgetRemaining.textContent = money(Math.abs(remaining));
    els.budgetRemaining.style.color = remaining < 0 ? "var(--danger)" : "";
    els.budgetProgress.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
    els.budgetProgress.className = tone;
    els.budgetStatusText.className = `budget-status ${tone === "over" ? "over" : ""}`;
    els.budgetStatusText.textContent = remaining >= 0
      ? `${Math.round(ratio * 100)} % genutzt · ${money(remaining)} verfügbar`
      : `${money(Math.abs(remaining))} über dem Budget`;

    const spentByCategory = totalsByCategory(expenses);
    const rows = configured.map(([key, monthlyBudget]) => {
      const budget = Number(monthlyBudget) * factor;
      const spent = spentByCategory[key] || 0;
      return { key, budget, spent, ratio: budget > 0 ? spent / budget : 0 };
    }).sort((a, b) => b.ratio - a.ratio);

    els.budgetRows.innerHTML = rows.map(row => {
      const toneClass = progressTone(row.ratio);
      return `<div class="budget-row"><div class="budget-row-head"><span>${categories[row.key].icon} ${categories[row.key].label}</span><strong>${shortMoney(row.spent)} / ${shortMoney(row.budget)} CHF</strong></div><div class="progress-track"><span class="${toneClass}" style="width:${Math.min(100, row.ratio * 100).toFixed(1)}%"></span></div></div>`;
    }).join("");
    return rows.filter(row => row.ratio > 1);
  }

  function renderCategoryDetail(expenses, total, categoryTotals) {
    if (!categoryTotals.length) {
      selectedAnalysisCategory = null;
      els.categoryDetailIcon.textContent = "•••";
      els.categoryDetailTitle.textContent = "Keine Kategorie";
      els.categoryDetailAmount.textContent = money(0);
      setSecondaryCurrency(els.categoryDetailForeign, 0);
      els.categoryDetailShare.textContent = "0 % Anteil";
      els.categoryDetailAverage.textContent = `Ø ${money(0)}`;
      els.categoryDetailCount.textContent = "0 Buchungen";
      els.categoryDetailList.innerHTML = emptyState("Keine Buchungen", "Für diesen Zeitraum liegen keine Ausgaben vor.", "⌁");
      return;
    }

    const available = new Set(categoryTotals.map(([key]) => key));
    if (!selectedAnalysisCategory || !available.has(selectedAnalysisCategory)) selectedAnalysisCategory = categoryTotals[0][0];
    const key = selectedAnalysisCategory;
    const item = categories[key] || categories.sonstiges;
    const rows = expenses.filter(expense => expense.category === key).sort((a, b) => b.amount - a.amount);
    const amount = rows.reduce((sum, expense) => sum + expense.amount, 0);
    els.categoryDetailIcon.textContent = item.icon;
    els.categoryDetailIcon.style.setProperty("--cat-color", item.color);
    els.categoryDetailTitle.textContent = item.label;
    els.categoryDetailAmount.textContent = money(amount);
    setSecondaryCurrency(els.categoryDetailForeign, euroOriginalTotal(rows));
    els.categoryDetailShare.textContent = `${total ? Math.round(amount / total * 100) : 0} % Anteil`;
    els.categoryDetailAverage.textContent = `Ø ${money(rows.length ? amount / rows.length : 0)}`;
    els.categoryDetailCount.textContent = `${rows.length} ${rows.length === 1 ? "Buchung" : "Buchungen"}`;
    els.categoryDetailList.innerHTML = rows.map(expenseMarkup).join("");
  }

  function renderLargestExpenses(expenses) {
    const rows = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
    els.largestExpenses.innerHTML = rows.length
      ? rows.map(expenseMarkup).join("")
      : emptyState("Keine Ausgaben", "Hier erscheinen die grössten Buchungen des gewählten Zeitraums.", "⌁");
  }

  function activePeriodicExpenses() {
    const latest = new Map();
    state.expenses
      .filter(expense => expense.cadence === "annual" || expense.cadence === "semiannual")
      .forEach(expense => {
        const key = `${expense.cadence}|${expense.category}|${String(expense.description).trim().toLocaleLowerCase("de-CH")}`;
        const existing = latest.get(key);
        if (!existing || expense.date > existing.date || (expense.date === existing.date && expense.createdAt > existing.createdAt)) latest.set(key, expense);
      });
    return [...latest.values()].sort((a, b) => (b.amount / cadences[b.cadence].months) - (a.amount / cadences[a.cadence].months));
  }

  function renderPeriodic(periodExpenses) {
    const active = activePeriodicExpenses();
    const paid = periodExpenses
      .filter(expense => expense.cadence === "annual" || expense.cadence === "semiannual");
    const paidTotal = paid.reduce((sum, expense) => sum + expense.amount, 0);
    const paidEuro = euroOriginalTotal(paid);
    const monthlyReserve = active.reduce((sum, expense) => sum + expense.amount / cadences[expense.cadence].months, 0);
    const monthlyReserveEuro = active
      .filter(expense => expense.currency === "EUR")
      .reduce((sum, expense) => sum + expense.originalAmount / cadences[expense.cadence].months, 0);
    els.periodicCount.textContent = String(active.length);
    els.periodicEmpty.hidden = active.length > 0;
    els.periodicContent.hidden = active.length === 0;
    if (active.length) {
      els.periodicPaid.textContent = money(paidTotal);
      setSecondaryCurrency(els.periodicPaidForeign, paidEuro);
      els.periodicReserve.textContent = money(monthlyReserve);
      setSecondaryCurrency(els.periodicReserveForeign, monthlyReserveEuro);
      els.periodicList.innerHTML = active.map(expenseMarkup).join("");
    }
    return { count: paid.length, paidTotal, monthlyReserve };
  }

  function renderAnalysis() {
    const bounds = periodBounds(analysisMode, analysisAnchor);
    const previousStart = shiftPeriod(bounds.start, analysisMode, -1);
    const previousBounds = { start: previousStart, end: endOfPeriod(analysisMode, previousStart) };
    const allExpenses = expensesInPeriod(bounds);
    const allPreviousExpenses = expensesInPeriod(previousBounds);
    const regularExpenses = allExpenses.filter(expense => !expense.cadence || expense.cadence === "standard");
    const regularPreviousExpenses = allPreviousExpenses.filter(expense => !expense.cadence || expense.cadence === "standard");
    const expenses = analysisScope === "cashflow" ? allExpenses : regularExpenses;
    const previousExpenses = analysisScope === "cashflow" ? allPreviousExpenses : regularPreviousExpenses;
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const euroTotal = euroOriginalTotal(expenses);
    const comparisonBounds = comparablePreviousBounds(analysisMode, bounds, previousBounds);
    const comparisonExpenses = previousExpenses.filter(expense => isInBounds(expense.date, comparisonBounds));
    const previousTotal = comparisonExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const categoryTotals = Object.entries(totalsByCategory(expenses)).sort((a, b) => b[1] - a[1]);
    const today = dateFromISO(todayISO());
    const currentBounds = periodBounds(analysisMode, todayISO());
    const divisorEnd = today >= bounds.start && today <= bounds.end ? today : bounds.end;
    const divisor = daysInclusive(bounds.start, divisorEnd);
    const largest = [...expenses].sort((a, b) => b.amount - a.amount)[0];

    document.querySelectorAll("[data-range]").forEach(button => {
      const active = button.dataset.range === analysisMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-analysis-scope]").forEach(button => {
      const active = button.dataset.analysisScope === analysisScope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.periodLabel.textContent = periodText(analysisMode, bounds);
    els.nextPeriod.disabled = bounds.start >= currentBounds.start;
    const periodLabel = analysisMode === "week" ? "in der Woche" : analysisMode === "year" ? "im Jahr" : "im Monat";
    els.analysisTotalLabel.textContent = analysisScope === "cashflow" ? `Alle Zahlungen ${periodLabel}` : `Laufende Ausgaben ${periodLabel}`;
    els.analysisTotal.textContent = money(total);
    setSecondaryCurrency(els.analysisForeignTotal, euroTotal);
    els.analysisCount.textContent = `${expenses.length} ${expenses.length === 1 ? "Buchung" : "Buchungen"}`;
    els.analysisBookingMetric.textContent = String(expenses.length);
    els.analysisDailyAverage.textContent = money(total / divisor);
    els.analysisLargestMetric.textContent = money(largest?.amount || 0);
    els.donutTotal.textContent = String(categoryTotals.length);

    els.analysisComparison.className = "";
    let change = null;
    const previousPhrases = previousPeriodPhrases(analysisMode, comparisonBounds);
    if (previousTotal > 0) {
      change = ((total - previousTotal) / previousTotal) * 100;
      if (Math.abs(change) < 0.5) {
        els.analysisComparison.textContent = `Gleich viel wie ${previousPhrases.during}`;
      } else {
        els.analysisComparison.textContent = `${Math.abs(change).toFixed(0)} % ${change < 0 ? "weniger" : "mehr"} als ${previousPhrases.during}`;
        els.analysisComparison.className = change < 0 ? "positive" : "negative";
      }
    } else if (total > 0) {
      els.analysisComparison.textContent = `Keine Ausgaben ${previousPhrases.during}`;
    } else {
      els.analysisComparison.textContent = `Noch keine Vergleichsdaten ${previousPhrases.source}`;
    }

    renderTrend(
      trendBuckets(analysisMode, bounds, expenses),
      trendBuckets(analysisMode, previousBounds, previousExpenses),
      total
    );
    renderCategoryDetail(expenses, total, categoryTotals);

    if (!categoryTotals.length) {
      els.donutChart.style.background = "conic-gradient(var(--surface-soft) 0 100%)";
      els.donutChart.setAttribute("aria-label", "Keine Ausgaben im gewählten Zeitraum");
      els.chartLegend.innerHTML = '<span class="muted">Keine Daten für diesen Zeitraum.</span>';
    } else {
      let cursor = 0;
      const segments = categoryTotals.map(([key, amount]) => {
        const start = cursor;
        const share = total ? amount / total * 100 : 0;
        cursor += share;
        return `${categories[key].color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
      });
      els.donutChart.style.background = `conic-gradient(${segments.join(",")})`;
      els.donutChart.setAttribute("aria-label", `${categoryTotals.length} Kategorien mit insgesamt ${money(total)}`);
      els.chartLegend.innerHTML = categoryTotals.map(([key, amount]) => `<button class="legend-item ${selectedAnalysisCategory === key ? "active" : ""}" type="button" data-analysis-category="${key}" style="--legend-color:${categories[key].color}"><span class="legend-dot"></span><span>${categories[key].label}</span><strong>${Math.round(amount / total * 100)} %</strong></button>`).join("");
    }

    const overBudget = renderBudget(regularExpenses);
    const periodic = renderPeriodic(allExpenses);
    renderLargestExpenses(expenses);

    const forecast = renderForecast(bounds, expenses, total);
    const movers = renderChanges(expenses, comparisonExpenses, previousTotal > 0, previousPhrases);

    const insights = [];
    if (!expenses.length) {
      insights.push("Erfasse Ausgaben in diesem Zeitraum, um persönliche Hinweise zu erhalten.");
    } else {
      if (overBudget.length) {
        const worst = [...overBudget].sort((a, b) => b.ratio - a.ratio)[0];
        insights.push(`${categories[worst.key].label} liegt ${money(worst.spent - worst.budget)} über dem anteiligen Budget.`);
      }
      if (forecast?.budget && forecast.projected > forecast.budget && !overBudget.length) {
        insights.push(`Bei deinem aktuellen Tempo landest du bei rund ${money(forecast.projected)} – ${money(forecast.projected - forecast.budget)} über deinem Budget. Mit höchstens ${money(Math.max(0, forecast.budgetPerDay))} pro Tag bleibst du im Rahmen.`);
      }
      if (change !== null && change > 15) {
        const driver = movers.find(row => row.delta > 0);
        insights.push(`Deine Ausgaben sind ${Math.round(change)} % höher als ${previousPhrases.during}${driver ? ` – vor allem wegen ${categories[driver.key].label} (+${money(driver.delta)})` : ""}.`);
      } else if (change !== null && change < -15) {
        const saver = movers.find(row => row.delta < 0);
        insights.push(`Du hast ${Math.abs(Math.round(change))} % weniger ausgegeben als ${previousPhrases.during}${saver ? `, am meisten gespart bei ${categories[saver.key].label} (−${money(Math.abs(saver.delta))})` : ""}.`);
      }
      const unusual = findUnusualExpense(expenses);
      if (unusual) {
        insights.push(`Ungewöhnlich hoch: «${unusual.expense.description}» mit ${money(unusual.expense.amount)} – etwa ${unusual.factor.toFixed(1).replace(".0", "")}× so viel wie sonst bei ${categories[unusual.expense.category].label}.`);
      }
      const recurring = detectRecurring();
      if (recurring.length) {
        const monthlySum = recurring.reduce((sum, item) => sum + item.amount, 0);
        const names = recurring.slice(0, 3).map(item => item.description).join(", ");
        const subs = recurring.filter(item => item.category === "abos" || item.category === "kommunikation");
        const subsSum = subs.reduce((sum, item) => sum + item.amount, 0);
        insights.push(`${recurring.length} wiederkehrende ${recurring.length === 1 ? "Zahlung" : "Zahlungen"} erkannt (${names}${recurring.length > 3 ? " …" : ""}), zusammen ca. ${money(monthlySum)} Fixkosten pro Monat.${subs.length ? ` Davon Abos & Verträge: ${money(subsSum)} – das sind ${money(subsSum * 12)} im Jahr.` : ""}`);
      }
      if (analysisScope === "regular" && periodic.count) {
        insights.push(`${periodic.count} periodische ${periodic.count === 1 ? "Rechnung wurde" : "Rechnungen wurden"} mit ${money(periodic.paidTotal)} ausgeklammert. Empfohlene monatliche Rücklage: ${money(periodic.monthlyReserve)}.`);
      }
      const weekend = weekendShare(expenses);
      if (weekend && analysisMode !== "week") {
        insights.push(`${Math.round(weekend * 100)} % deiner Ausgaben fallen aufs Wochenende – deutlich mehr als an Werktagen.`);
      }
      if (insights.length < 2) {
        const [topKey, topAmount] = categoryTotals[0];
        insights.push(`${categories[topKey].label} ist mit ${money(topAmount)} (${Math.round(topAmount / total * 100)} %) deine grösste Kategorie in diesem Zeitraum.`);
      }
    }
    els.insightList.innerHTML = insights.slice(0, 4).map(text => `<li>${escapeHtml(text)}</li>`).join("");
  }

  function renderForecast(bounds, expenses, total) {
    const today = dateFromISO(todayISO());
    const isCurrent = today >= bounds.start && today <= bounds.end;
    els.forecastCard.hidden = !isCurrent;
    if (!isCurrent) return null;

    const totalDays = daysInclusive(bounds.start, bounds.end);
    const elapsed = daysInclusive(bounds.start, today);
    const remaining = totalDays - elapsed;
    const oneOffs = analysisScope === "cashflow"
      ? expenses.filter(expense => expense.cadence === "annual" || expense.cadence === "semiannual").reduce((sum, expense) => sum + expense.amount, 0)
      : 0;
    const runningSpent = total - oneOffs;

    // Historischer Tagesdurchschnitt aus den letzten drei Perioden (nur laufende Ausgaben)
    const history = [];
    for (let step = 1; step <= 3; step += 1) {
      const start = shiftPeriod(bounds.start, analysisMode, -step);
      const pastBounds = { start, end: endOfPeriod(analysisMode, start) };
      const rows = expensesInPeriod(pastBounds).filter(expense => !expense.cadence || expense.cadence === "standard");
      if (rows.length) history.push(rows.reduce((sum, expense) => sum + expense.amount, 0) / daysInclusive(pastBounds.start, pastBounds.end));
    }
    const currentRate = runningSpent / elapsed;
    const historicRate = history.length ? history.reduce((a, b) => a + b, 0) / history.length : null;
    const weight = Math.min(1, elapsed / totalDays + 0.15);
    const rate = historicRate === null ? currentRate : weight * currentRate + (1 - weight) * historicRate;
    const projected = total + rate * remaining;

    const configured = Object.entries(state.budgets).filter(([key, value]) => categories[key] && Number(value) > 0);
    const budget = configured.length ? configured.reduce((sum, [, value]) => sum + Number(value), 0) * budgetScale(analysisMode) : 0;
    const periodWord = analysisMode === "week" ? "Woche" : analysisMode === "year" ? "Jahr" : "Monat";
    const endWord = analysisMode === "week" ? "bis Sonntag" : analysisMode === "year" ? "bis Ende Jahr" : "bis Ende Monat";

    els.forecastHint.textContent = `${endWord} · ${history.length ? "aktuelles Tempo + Vergleichsperioden" : "aktuelles Tempo"}`;
    els.forecastDays.textContent = remaining === 0 ? "letzter Tag" : `${remaining} ${remaining === 1 ? "Tag" : "Tage"} übrig`;
    els.forecastTotal.textContent = `≈ ${money(projected)}`;
    els.forecastSoFar.textContent = money(total);

    const scale = Math.max(projected, budget, 1);
    els.forecastSpent.style.width = `${Math.min(100, total / scale * 100).toFixed(1)}%`;
    els.forecastSpent.parentElement.style.setProperty("--projected", `${Math.min(100, projected / scale * 100).toFixed(1)}%`);
    els.forecastBudgetMark.hidden = !budget;

    let budgetPerDay = null;
    els.forecastText.className = "forecast-text";
    if (budget) {
      els.forecastBudgetMark.style.left = `${Math.min(100, budget / scale * 100).toFixed(1)}%`;
      const left = budget - total;
      budgetPerDay = remaining > 0 ? left / remaining : left;
      if (projected > budget) {
        els.forecastText.textContent = `Voraussichtlich ${money(projected - budget)} über deinem Budget von ${money(budget)}.`;
        els.forecastText.classList.add("negative");
      } else {
        els.forecastText.textContent = `Voraussichtlich ${money(budget - projected)} unter deinem Budget von ${money(budget)}.`;
        els.forecastText.classList.add("positive");
      }
      els.forecastDailyLabel.textContent = left >= 0 ? "Noch verfügbar pro Tag" : "Budget überschritten";
      els.forecastDaily.textContent = money(Math.max(0, budgetPerDay));
    } else {
      els.forecastText.textContent = historicRate !== null
        ? `Das wären ${money(Math.abs(projected - historicRate * totalDays))} ${projected >= historicRate * totalDays ? "mehr" : "weniger"} als dein üblicher ${periodWord}.`
        : `Schätzung auf Basis deiner bisherigen Ausgaben in diesem ${periodWord === "Woche" ? "Zeitraum" : periodWord}.`;
      els.forecastDailyLabel.textContent = "Tempo pro Tag";
      els.forecastDaily.textContent = money(rate);
    }
    return { projected, budget, budgetPerDay };
  }

  function renderChanges(expenses, previousExpenses, hasPrevious, phrases) {
    els.changesHint.textContent = phrases.compared;
    if (!hasPrevious || !expenses.length) {
      els.changesList.innerHTML = emptyState("Noch kein Vergleich", `Sobald Ausgaben ${phrases.during} vorliegen, siehst du hier, was sich verändert hat.`, "⇅");
      return [];
    }
    const now = totalsByCategory(expenses);
    const before = totalsByCategory(previousExpenses);
    const rows = [...new Set([...Object.keys(now), ...Object.keys(before)])]
      .filter(key => categories[key])
      .map(key => ({ key, now: now[key] || 0, before: before[key] || 0, delta: (now[key] || 0) - (before[key] || 0) }))
      .filter(row => Math.abs(row.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (!rows.length) {
      els.changesList.innerHTML = emptyState("Kaum Veränderung", "Deine Kategorien liegen auf dem Niveau der Vorperiode.", "＝");
      return [];
    }
    const maxDelta = Math.max(...rows.map(row => Math.abs(row.delta)));
    els.changesList.innerHTML = rows.slice(0, 6).map(row => {
      const up = row.delta > 0;
      const width = (Math.abs(row.delta) / maxDelta * 50).toFixed(1);
      const percent = row.before > 0 ? ` · ${up ? "+" : "−"}${Math.round(Math.abs(row.delta) / row.before * 100)} %` : " · neu";
      return `<div class="change-row"><div class="change-head"><span>${categories[row.key].icon} ${categories[row.key].label}</span><strong class="${up ? "negative" : "positive"}">${up ? "+" : "−"}${money(Math.abs(row.delta))}</strong></div><div class="change-bar"><span class="${up ? "up" : "down"}" style="width:${width}%"></span></div><small>${shortMoney(row.before)} → ${shortMoney(row.now)} CHF${percent}</small></div>`;
    }).join("");
    return rows;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function findUnusualExpense(expenses) {
    let best = null;
    expenses
      .filter(expense => !expense.cadence || expense.cadence === "standard")
      .forEach(expense => {
        const others = state.expenses.filter(other => other.category === expense.category && other.id !== expense.id && (!other.cadence || other.cadence === "standard"));
        if (others.length < 4) return;
        const typical = median(others.map(other => other.amount));
        if (typical <= 0) return;
        const factor = expense.amount / typical;
        if (factor >= 3 && expense.amount - typical >= 30 && (!best || factor > best.factor)) best = { expense, factor };
      });
    return best;
  }

  function normalizeDescription(value) {
    return String(value).toLocaleLowerCase("de-CH").replace(/\d+/g, "").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

  function detectRecurring() {
    const today = dateFromISO(todayISO());
    const cutoff = new Date(today.getFullYear(), today.getMonth() - 4, 1, 12);
    const groups = new Map();
    state.expenses
      .filter(expense => (!expense.cadence || expense.cadence === "standard") && dateFromISO(expense.date) >= cutoff)
      .forEach(expense => {
        const key = normalizeDescription(expense.description);
        if (key.length < 3) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(expense);
      });
    const result = [];
    groups.forEach(rows => {
      const months = new Set(rows.map(row => monthKey(row.date)));
      if (months.size < 3 || rows.length > months.size * 1.5) return;
      const amounts = rows.map(row => row.amount);
      const typical = median(amounts);
      const stable = amounts.every(amount => Math.abs(amount - typical) <= Math.max(2, typical * 0.15));
      if (!stable) return;
      const latest = [...rows].sort(sortNewest)[0];
      result.push({ description: latest.description, amount: typical, category: latest.category });
    });
    return result.sort((a, b) => b.amount - a.amount);
  }

  function weekendShare(expenses) {
    const regular = expenses.filter(expense => !expense.cadence || expense.cadence === "standard");
    if (regular.length < 8) return null;
    const total = regular.reduce((sum, expense) => sum + expense.amount, 0);
    if (!total) return null;
    const weekend = regular.filter(expense => [0, 6].includes(dateFromISO(expense.date).getDay())).reduce((sum, expense) => sum + expense.amount, 0);
    const share = weekend / total;
    // Wochenende = 2/7 der Tage ≈ 29 %. Nur melden, wenn klar darüber.
    return share >= 0.5 ? share : null;
  }

  function renderBudgetInputs() {
    els.budgetInputs.innerHTML = Object.entries(categories).map(([key, item]) => {
      const value = Number(state.budgets[key]) > 0 ? Number(state.budgets[key]).toFixed(2) : "";
      return `<div class="budget-input-row"><label for="budget-${key}"><span>${item.icon}</span><span>${item.label}</span></label><div class="input-wrap amount-wrap"><span>CHF</span><input id="budget-${key}" data-budget-category="${key}" type="text" inputmode="decimal" value="${value}" placeholder="0.00" aria-label="Monatsbudget ${item.label}"></div></div>`;
    }).join("");
  }

  function openBudgetDialog() {
    renderBudgetInputs();
    els.budgetDialog.showModal();
  }

  function saveBudgets() {
    const budgets = {};
    els.budgetInputs.querySelectorAll("[data-budget-category]").forEach(input => {
      const amount = parseAmount(input.value);
      if (amount) budgets[input.dataset.budgetCategory] = amount;
    });
    state.budgets = budgets;
    persist();
    renderAnalysis();
    els.budgetDialog.close();
    showToast("Monatsbudgets gespeichert");
  }

  function renderAll() {
    renderCapture();
    renderExpenses();
    renderAnalysis();
  }

  function updateCurrencyFields(currencyElement, rateField, rateInput) {
    const isEuro = currencyElement.value === "EUR";
    rateField.hidden = !isEuro;
    if (isEuro && !parseRate(rateInput.value)) rateInput.value = Number(state.settings.eurToChfRate || DEFAULT_EUR_TO_CHF).toFixed(4);
  }

  function rateDateLabel() {
    const raw = state.settings.eurRateSourceDate || state.settings.eurRateUpdatedAt;
    if (!raw) return null;
    const date = state.settings.eurRateSourceDate ? dateFromISO(raw) : new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function renderRateStatus(message = "") {
    if (message) {
      els.rateStatus.textContent = message;
      return;
    }
    const rate = Number(state.settings.eurToChfRate || DEFAULT_EUR_TO_CHF).toFixed(4);
    const date = rateDateLabel();
    els.rateStatus.textContent = date
      ? `1 EUR = ${rate} CHF · Kurs vom ${date}`
      : `1 EUR = ${rate} CHF · erste Aktualisierung ausstehend`;
  }

  function rateRefreshDue() {
    const lastUpdate = Date.parse(state.settings.eurRateUpdatedAt || "");
    return !Number.isFinite(lastUpdate) || Date.now() - lastUpdate >= EUR_RATE_REFRESH_MS;
  }

  async function refreshExchangeRate({ manual = false } = {}) {
    if (rateRefreshInFlight) return;
    if (globalThis.navigator?.onLine === false) {
      renderRateStatus("Offline · letzter gespeicherter Kurs wird verwendet");
      if (manual) showToast("Offline – Kurs konnte nicht aktualisiert werden");
      return;
    }

    rateRefreshInFlight = true;
    els.refreshRate.disabled = true;
    renderRateStatus("EZB-Kurs wird aktualisiert …");
    try {
      const response = await fetch(EUR_RATE_ENDPOINT, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Kursdienst antwortet mit ${response.status}`);
      const data = await response.json();
      const rate = parseRate(data?.rate);
      if (!rate) throw new Error("Ungültiger Kurs");

      state.settings.eurToChfRate = rate;
      state.settings.eurRateUpdatedAt = new Date().toISOString();
      state.settings.eurRateSourceDate = /^\d{4}-\d{2}-\d{2}$/.test(data?.date || "") ? data.date : null;
      els.exchangeRate.value = rate.toFixed(4);
      if (els.editDialog.open && els.editCurrency.value === "EUR") els.editExchangeRate.value = rate.toFixed(4);
      persist();
      renderRateStatus();
      if (manual) showToast(`Aktueller Kurs: 1 EUR = ${rate.toFixed(4)} CHF`);
    } catch {
      renderRateStatus("Aktualisierung nicht möglich · letzter Kurs bleibt aktiv");
      if (manual) showToast("Kurs konnte nicht aktualisiert werden");
    } finally {
      rateRefreshInFlight = false;
      els.refreshRate.disabled = false;
    }
  }

  function maybeRefreshExchangeRate() {
    renderRateStatus();
    if (rateRefreshDue()) refreshExchangeRate();
  }

  function updatePrediction() {
    const text = els.description.value.trim();
    currentPrediction = predictCategory(text);
    if (!text) {
      els.prediction.classList.remove("ready");
      els.predictionText.textContent = "KI-Kategorie erscheint hier";
      els.category.value = "sonstiges";
      return;
    }
    const category = categories[currentPrediction.category];
    els.category.value = currentPrediction.category;
    els.prediction.classList.add("ready");
    els.predictionText.textContent = `${category.icon} ${category.label} · ${currentPrediction.confidence} % sicher`;
  }

  function addExpense({ description, amount, date, category, cadence = "standard", currency = "CHF", exchangeRate }) {
    const cleanDescription = String(description).trim();
    const originalAmount = parseAmount(amount);
    const finalCurrency = currency === "EUR" ? "EUR" : "CHF";
    const parsedRate = finalCurrency === "EUR" ? parseRate(exchangeRate) : 1;
    if (!cleanDescription) throw new Error("Beschreibung fehlt.");
    if (!originalAmount) throw new Error("Betrag ist ungültig.");
    if (finalCurrency === "EUR" && !parsedRate) throw new Error("Umrechnungskurs ist ungültig.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Datum ist ungültig.");
    const prediction = predictCategory(cleanDescription);
    const finalCategory = categories[category] ? category : prediction.category;
    const finalCadence = cadences[cadence] ? cadence : "standard";
    if (finalCategory !== prediction.category) learn(cleanDescription, finalCategory);
    const amountChf = Math.round(originalAmount * parsedRate * 100) / 100;

    const expense = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      description: cleanDescription,
      amount: amountChf,
      originalAmount,
      currency: finalCurrency,
      exchangeRate: parsedRate,
      date,
      category: finalCategory,
      cadence: finalCadence,
      predictedCategory: prediction.category,
      createdAt: Date.now()
    };
    state.expenses.push(expense);
    if (finalCurrency === "EUR") state.settings.eurToChfRate = parsedRate;
    persist();
    renderAll();
    return expense;
  }

  function openEdit(id) {
    const expense = state.expenses.find(item => item.id === id);
    if (!expense) return;
    els.editId.value = expense.id;
    els.editTitle.textContent = expense.description;
    els.editAmount.value = Number(expense.originalAmount).toFixed(2);
    els.editCurrency.value = expense.currency === "EUR" ? "EUR" : "CHF";
    els.editExchangeRate.value = Number(expense.exchangeRate || state.settings.eurToChfRate).toFixed(4);
    updateCurrencyFields(els.editCurrency, els.editExchangeRateField, els.editExchangeRate);
    els.editCategory.value = expense.category;
    els.editCadence.value = cadences[expense.cadence] ? expense.cadence : "standard";
    els.editDialog.showModal();
  }

  function saveEdit() {
    const expense = state.expenses.find(item => item.id === els.editId.value);
    if (!expense) return;
    const originalAmount = parseAmount(els.editAmount.value);
    const nextCurrency = els.editCurrency.value === "EUR" ? "EUR" : "CHF";
    const exchangeRate = nextCurrency === "EUR" ? parseRate(els.editExchangeRate.value) : 1;
    if (!originalAmount) return showToast("Betrag ist ungültig.");
    if (nextCurrency === "EUR" && !exchangeRate) return showToast("Umrechnungskurs ist ungültig.");
    const nextCategory = els.editCategory.value;
    const nextCadence = cadences[els.editCadence.value] ? els.editCadence.value : "standard";
    if (nextCategory !== expense.category) learn(expense.description, nextCategory);
    expense.category = nextCategory;
    expense.cadence = nextCadence;
    expense.originalAmount = originalAmount;
    expense.currency = nextCurrency;
    expense.exchangeRate = exchangeRate;
    expense.amount = Math.round(originalAmount * exchangeRate * 100) / 100;
    if (nextCurrency === "EUR") state.settings.eurToChfRate = exchangeRate;
    persist();
    renderAll();
    els.editDialog.close();
    showToast(nextCadence === "standard" ? "Ausgabe gespeichert" : `${cadences[nextCadence].label} eingeordnet · Budget bereinigt`);
  }

  function deleteExpense() {
    const index = state.expenses.findIndex(item => item.id === els.editId.value);
    if (index < 0) return;
    if (!window.confirm(`„${state.expenses[index].description}“ wirklich löschen?`)) return;
    state.expenses.splice(index, 1);
    persist();
    renderAll();
    els.editDialog.close();
    showToast("Ausgabe gelöscht");
  }

  function setView(view) {
    document.querySelectorAll(".view").forEach(section => section.classList.toggle("active", section.id === `${view}View`));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "analysis") renderAnalysis();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2300);
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_KEY, theme);
  }

  function registerWebMCP() {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const addTool = {
      name: "add_expense",
      title: "Ausgabe erfassen",
      description: "Erfasst eine Ausgabe, kategorisiert sie bei Bedarf automatisch und aktualisiert die sichtbare App.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", minLength: 1, maxLength: 80 },
          amount: { type: "number", exclusiveMinimum: 0 },
          currency: { type: "string", enum: ["CHF", "EUR"] },
          exchangeRate: { type: "number", exclusiveMinimum: 0, description: "CHF pro EUR; nötig bei EUR." },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          category: { type: "string", enum: Object.keys(categories) },
          cadence: { type: "string", enum: Object.keys(cadences) }
        },
        required: ["description", "amount", "date"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const expense = addExpense(input || {});
        return { id: expense.id, category: expense.category, cadence: expense.cadence, amountChf: expense.amount, originalAmount: expense.originalAmount, currency: expense.currency, exchangeRate: expense.exchangeRate, saved: true };
      }
    };

    const listTool = {
      name: "list_expenses",
      title: "Ausgaben anzeigen",
      description: "Liest die lokal gespeicherten Ausgaben, optional für einen Monat oder eine Kategorie.",
      inputSchema: {
        type: "object",
        properties: {
          month: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
          category: { type: "string", enum: Object.keys(categories) }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input = {}) {
        const rows = state.expenses.filter(expense => (!input.month || monthKey(expense.date) === input.month) && (!input.category || expense.category === input.category));
        return { count: rows.length, totalChf: rows.reduce((sum, row) => sum + row.amount, 0), totalEuroOriginal: euroOriginalTotal(rows), expenses: rows.map(({ id, description, amount, originalAmount, currency, exchangeRate, date, category, cadence }) => ({ id, description, amountChf: amount, originalAmount, currency, exchangeRate, date, category, cadence })) };
      }
    };

    try {
      Promise.resolve(context.registerTool(addTool)).catch(() => {});
      Promise.resolve(context.registerTool(listTool)).catch(() => {});
    } catch { /* Unsupported preview implementations may throw. */ }
  }

  fillCategorySelect(els.category);
  fillCategorySelect(els.editCategory);
  fillCategorySelect(els.categoryFilter, true);
  els.date.value = todayISO();
  els.exchangeRate.value = Number(state.settings.eurToChfRate || DEFAULT_EUR_TO_CHF).toFixed(4);
  updateCurrencyFields(els.currency, els.exchangeRateField, els.exchangeRate);
  applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  renderAll();
  maybeRefreshExchangeRate();
  registerWebMCP();

  els.description.addEventListener("input", updatePrediction);
  els.currency.addEventListener("change", () => {
    updateCurrencyFields(els.currency, els.exchangeRateField, els.exchangeRate);
    if (els.currency.value === "EUR") maybeRefreshExchangeRate();
  });
  els.editCurrency.addEventListener("change", () => updateCurrencyFields(els.editCurrency, els.editExchangeRateField, els.editExchangeRate));
  els.refreshRate.addEventListener("click", () => refreshExchangeRate({ manual: true }));
  els.form.addEventListener("submit", event => {
    event.preventDefault();
    try {
      const expense = addExpense({ description: els.description.value, amount: els.amount.value, currency: els.currency.value, exchangeRate: els.exchangeRate.value, date: els.date.value, category: els.category.value, cadence: els.cadence.value });
      els.form.reset();
      els.date.value = todayISO();
      els.exchangeRate.value = Number(state.settings.eurToChfRate || DEFAULT_EUR_TO_CHF).toFixed(4);
      updateCurrencyFields(els.currency, els.exchangeRateField, els.exchangeRate);
      updatePrediction();
      els.description.focus();
      showToast(expense.currency === "EUR"
        ? `${euroMoney(expense.originalAmount)} als ${money(expense.amount)} gespeichert`
        : `${categories[expense.category].icon} Als ${categories[expense.category].label} gespeichert`);
    } catch (error) {
      showToast(error.message || "Ausgabe konnte nicht gespeichert werden");
    }
  });

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) setView(nav.dataset.view);
    const go = event.target.closest("[data-go]");
    if (go) setView(go.dataset.go);
    const edit = event.target.closest("[data-edit-id]");
    if (edit) openEdit(edit.dataset.editId);
    const range = event.target.closest("[data-range]");
    if (range) {
      analysisMode = range.dataset.range;
      analysisAnchor = todayISO();
      selectedAnalysisCategory = null;
      renderAnalysis();
    }
    const scope = event.target.closest("[data-analysis-scope]");
    if (scope) {
      analysisScope = scope.dataset.analysisScope;
      selectedAnalysisCategory = null;
      renderAnalysis();
    }
    const analysisCategory = event.target.closest("[data-analysis-category]");
    if (analysisCategory) {
      selectedAnalysisCategory = analysisCategory.dataset.analysisCategory;
      renderAnalysis();
      els.categoryDetailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const trendPoint = event.target.closest("[data-trend-index]");
    if (trendPoint) showTrendPoint(trendPoint.dataset.trendIndex);
  });

  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-trend-index]")) {
      event.preventDefault();
      showTrendPoint(event.target.dataset.trendIndex);
    }
  });

  els.categoryFilter.addEventListener("change", renderExpenses);
  els.sortOrder.addEventListener("change", renderExpenses);
  els.previousPeriod.addEventListener("click", () => {
    const bounds = periodBounds(analysisMode, analysisAnchor);
    analysisAnchor = dateToISO(shiftPeriod(bounds.start, analysisMode, -1));
    selectedAnalysisCategory = null;
    renderAnalysis();
  });
  els.nextPeriod.addEventListener("click", () => {
    if (els.nextPeriod.disabled) return;
    const bounds = periodBounds(analysisMode, analysisAnchor);
    analysisAnchor = dateToISO(shiftPeriod(bounds.start, analysisMode, 1));
    selectedAnalysisCategory = null;
    renderAnalysis();
  });
  document.querySelector("#editBudgets").addEventListener("click", openBudgetDialog);
  document.querySelector("#setBudgets").addEventListener("click", openBudgetDialog);
  document.querySelector("#saveBudgets").addEventListener("click", saveBudgets);
  document.querySelector("#saveEdit").addEventListener("click", saveEdit);
  document.querySelector("#deleteExpense").addEventListener("click", deleteExpense);
  els.themeButton.addEventListener("click", () => applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light"));
  els.exportBackup.addEventListener("click", exportBackup);
  els.importBackup.addEventListener("click", () => els.backupFile.click());
  els.backupFile.addEventListener("change", event => importBackupFile(event.target.files?.[0]));

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
})();
