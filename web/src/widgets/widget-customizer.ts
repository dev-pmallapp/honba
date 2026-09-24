import {
  getWidgetsForPage,
  getUserWidgetState,
  saveUserWidgetState,
  resetUserWidgetState,
  applyWidgetVisibility,
} from "./widget-registry";
import { THEMES, getCurrentTheme, setTheme } from "../theme";

export function initWidgetCustomizer(pageId: string) {
  // Apply initial widget visibility on page load
  applyWidgetVisibility(pageId);

  const customizeBtn = document.getElementById("btn-customize-widgets");
  if (!customizeBtn) return;

  // Create customizer modal dynamically if not already in DOM
  let modal = document.getElementById("widget-customizer-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "widget-customizer-modal";
    modal.className =
      "hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none p-4";
    document.body.appendChild(modal);
  }

  const renderModalContent = () => {
    if (!modal) return;
    const pageWidgets = getWidgetsForPage(pageId);
    const currentState = getUserWidgetState(pageId);
    const activeTheme = getCurrentTheme();

    const categories = Array.from(new Set(pageWidgets.map((w) => w.category)));

    modal.innerHTML = `
      <div class="bg-tv-secondary border border-tv-border rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-5 py-3.5 bg-tv-primary border-b border-tv-border flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-base">🎛️</span>
            <div>
              <h2 class="text-sm font-bold text-white tracking-wide">Workspace & Theme Customizer</h2>
              <p class="text-[11px] text-tv-muted">Configure color palette, typography & widgets for <span class="text-tv-accent uppercase font-mono font-semibold">${pageId}</span></p>
            </div>
          </div>
          <button id="close-customizer-btn" class="w-7 h-7 rounded flex items-center justify-center text-tv-muted hover:text-white hover:bg-tv-tertiary transition cursor-pointer text-sm">
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-3.5 space-y-4">
          
          <!-- 1. Color Palette & Typography Theme Selector -->
          <div class="space-y-2">
            <div class="text-[10px] text-tv-muted uppercase font-mono tracking-wider font-bold">
              🎨 Color Palette & Typography Theme
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              ${THEMES.map((theme) => {
                const isSelected = theme.id === activeTheme;
                return `
                <div data-theme-card="${theme.id}" class="p-2.5 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                  isSelected
                    ? "border-tv-accent bg-tv-tertiary shadow-sm"
                    : "border-tv-border bg-tv-primary hover:border-tv-elevated"
                }">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-white font-sans">${theme.name}</span>
                    <span class="text-[9px] font-mono text-tv-muted">${theme.fontSans}</span>
                  </div>
                  <div class="flex items-center space-x-1.5 mt-2">
                    <span class="w-3.5 h-3.5 rounded-full border border-black/40" style="background-color: ${theme.primaryBg}" title="Primary Background"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-black/40" style="background-color: ${theme.secondaryBg}" title="Secondary Background"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-black/40" style="background-color: ${theme.accentColor}" title="Accent Color"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-black/40" style="background-color: ${theme.bullishColor}" title="Bullish Green"></span>
                    <span class="w-3.5 h-3.5 rounded-full border border-black/40" style="background-color: ${theme.bearishColor}" title="Bearish Red"></span>
                    ${isSelected ? `<span class="ml-auto text-[10px] font-bold text-tv-bullish">✓ ACTIVE</span>` : ""}
                  </div>
                </div>
              `;
              }).join("")}
            </div>
          </div>

          <!-- 2. Presets Row -->
          <div class="pt-2 border-t border-tv-border flex items-center justify-between text-xs">
            <span class="text-tv-muted font-medium text-[11px]">Widget Layout Presets:</span>
            <div class="flex items-center space-x-1.5">
              <button id="preset-all" class="px-2.5 py-1 rounded bg-tv-tertiary hover:bg-tv-elevated text-white text-[11px] transition">
                Show All
              </button>
              <button id="preset-minimal" class="px-2.5 py-1 rounded bg-tv-tertiary hover:bg-tv-elevated text-tv-text text-[11px] transition">
                Minimal Focus
              </button>
              <button id="preset-reset" class="px-2.5 py-1 rounded bg-tv-tertiary hover:bg-tv-bearish/20 text-tv-bearish hover:text-white text-[11px] transition">
                Reset Default
              </button>
            </div>
          </div>

          <!-- 3. Widget Toggle List -->
          <div class="space-y-4">
            ${categories
              .map(
                (cat) => `
              <div>
                <div class="text-[10px] text-tv-muted uppercase font-mono tracking-wider mb-2 font-bold">${cat}</div>
                <div class="space-y-2">
                  ${pageWidgets
                    .filter((w) => w.category === cat)
                    .map((widget) => {
                      const isChecked = currentState[widget.id] !== false;
                      return `
                    <label class="flex items-center justify-between p-2.5 rounded-lg bg-tv-primary border border-tv-border hover:border-tv-elevated cursor-pointer transition">
                      <div class="flex items-start space-x-2.5 pr-3">
                        <span class="text-base mt-0.5">${widget.icon}</span>
                        <div>
                          <div class="text-xs font-semibold text-white flex items-center space-x-1.5">
                            <span>${widget.title}</span>
                            ${
                              widget.availablePages.includes("*")
                                ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-tv-accent/20 text-tv-accent font-mono">GLOBAL</span>`
                                : ""
                            }
                          </div>
                          <div class="text-[11px] text-tv-muted leading-snug mt-0.5">${widget.description}</div>
                        </div>
                      </div>

                      <!-- Switch -->
                      <div class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input type="checkbox" data-widget-toggle="${widget.id}" class="sr-only peer" ${isChecked ? "checked" : ""} />
                        <div class="w-9 h-5 bg-tv-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-tv-bullish"></div>
                      </div>
                    </label>
                  `;
                    })
                    .join("")}
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-5 py-3 bg-tv-primary border-t border-tv-border flex items-center justify-between">
          <div id="save-status-indicator" class="text-xs text-tv-bullish font-medium hidden">
            ✓ Theme & View saved to your user profile
          </div>
          <div class="flex items-center space-x-2 ml-auto">
            <button id="save-view-btn" class="bg-tv-accent hover:bg-tv-accent-hover text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow cursor-pointer">
              Save View as My Default
            </button>
          </div>
        </div>
      </div>
    `;

    // Bind event handlers
    const closeBtn = document.getElementById("close-customizer-btn");
    closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal?.classList.add("hidden");
    });

    // Theme selector cards
    const themeCards = modal.querySelectorAll<HTMLElement>("[data-theme-card]");
    themeCards.forEach((card) => {
      card.addEventListener("click", () => {
        const themeId = card.getAttribute("data-theme-card");
        if (themeId) {
          setTheme(themeId);
          renderModalContent();
        }
      });
    });

    // Checkbox toggles with instant live updates
    const toggles = modal.querySelectorAll<HTMLInputElement>("[data-widget-toggle]");
    toggles.forEach((t) => {
      t.addEventListener("change", () => {
        const id = t.getAttribute("data-widget-toggle");
        if (id) {
          currentState[id] = t.checked;
          saveUserWidgetState(pageId, currentState);
        }
      });
    });

    // Presets
    document.getElementById("preset-all")?.addEventListener("click", () => {
      pageWidgets.forEach((w) => (currentState[w.id] = true));
      saveUserWidgetState(pageId, currentState);
      renderModalContent();
    });

    document.getElementById("preset-minimal")?.addEventListener("click", () => {
      pageWidgets.forEach((w) => {
        if (w.id === "widget-chart" || w.id === "widget-sim-equity-curves" || w.id === "widget-designer-rules") {
          currentState[w.id] = true;
        } else {
          currentState[w.id] = false;
        }
      });
      saveUserWidgetState(pageId, currentState);
      renderModalContent();
    });

    document.getElementById("preset-reset")?.addEventListener("click", () => {
      resetUserWidgetState(pageId);
      renderModalContent();
    });

    // Save View Button
    document.getElementById("save-view-btn")?.addEventListener("click", () => {
      saveUserWidgetState(pageId, currentState);
      const indicator = document.getElementById("save-status-indicator");
      if (indicator) {
        indicator.classList.remove("hidden");
        setTimeout(() => indicator.classList.add("hidden"), 2000);
      }
      setTimeout(() => modal?.classList.add("hidden"), 600);
    });
  };

  customizeBtn.addEventListener("click", () => {
    renderModalContent();
    modal?.classList.remove("hidden");
  });
}
