import {
  getWidgetsForPage,
  getUserWidgetState,
  saveUserWidgetState,
  resetUserWidgetState,
  applyWidgetVisibility,
} from "./widget-registry";

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

    const categories = Array.from(new Set(pageWidgets.map((w) => w.category)));

    modal.innerHTML = `
      <div class="bg-[#1e222d] border border-[#2a2e39] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-5 py-3.5 bg-[#181b24] border-b border-[#2a2e39] flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-base">🎛️</span>
            <div>
              <h2 class="text-sm font-bold text-white tracking-wide">Workspace Widget Customizer</h2>
              <p class="text-[11px] text-[#787b86]">Personalize widgets visible on <span class="text-[#2962ff] uppercase font-mono font-semibold">${pageId}</span></p>
            </div>
          </div>
          <button id="close-customizer-btn" class="w-7 h-7 rounded flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition cursor-pointer text-sm">
            ✕
          </button>
        </div>

        <!-- Presets Row -->
        <div class="px-5 py-2.5 bg-[#131722] border-b border-[#2a2e39] flex items-center justify-between text-xs">
          <span class="text-[#787b86] font-medium">Quick Layout Presets:</span>
          <div class="flex items-center space-x-1.5">
            <button id="preset-all" class="px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-white text-[11px] transition">
              Show All
            </button>
            <button id="preset-minimal" class="px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[11px] transition">
              Minimal Focus
            </button>
            <button id="preset-reset" class="px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#f23645]/20 text-[#f23645] hover:text-white text-[11px] transition">
              Reset Default
            </button>
          </div>
        </div>

        <!-- Widget Toggle List -->
        <div class="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          ${categories
            .map(
              (cat) => `
            <div>
              <div class="text-[10px] text-[#787b86] uppercase font-mono tracking-wider mb-2 font-bold">${cat}</div>
              <div class="space-y-2">
                ${pageWidgets
                  .filter((w) => w.category === cat)
                  .map((widget) => {
                    const isChecked = currentState[widget.id] !== false;
                    return `
                  <label class="flex items-center justify-between p-2.5 rounded-lg bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] cursor-pointer transition">
                    <div class="flex items-start space-x-2.5 pr-3">
                      <span class="text-base mt-0.5">${widget.icon}</span>
                      <div>
                        <div class="text-xs font-semibold text-white flex items-center space-x-1.5">
                          <span>${widget.title}</span>
                          ${
                            widget.availablePages.includes("*")
                              ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-[#2962ff]/20 text-[#2962ff] font-mono">GLOBAL</span>`
                              : ""
                          }
                        </div>
                        <div class="text-[11px] text-[#787b86] leading-snug mt-0.5">${widget.description}</div>
                      </div>
                    </div>

                    <!-- Switch -->
                    <div class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input type="checkbox" data-widget-toggle="${widget.id}" class="sr-only peer" ${isChecked ? "checked" : ""} />
                      <div class="w-9 h-5 bg-[#2a2e39] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#089981]"></div>
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

        <!-- Modal Footer -->
        <div class="px-5 py-3 bg-[#181b24] border-t border-[#2a2e39] flex items-center justify-between">
          <div id="save-status-indicator" class="text-xs text-[#089981] font-medium hidden">
            ✓ View saved to your user profile
          </div>
          <div class="flex items-center space-x-2 ml-auto">
            <button id="save-view-btn" class="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition shadow cursor-pointer">
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
        // Keep only core primary widgets
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
