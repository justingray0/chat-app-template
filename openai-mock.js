/**
 * Mock implementation of window.openai for ChatGPT widget preview
 * This provides all the hooks and APIs that widgets expect in the ChatGPT environment
 */

(function () {
  'use strict';

  const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

  // Initialize window.openai with mock values
  const openaiGlobals = {
    // Visual properties
    theme: 'light',
    userAgent: {
      device: { type: 'desktop' },
      capabilities: {
        hover: true,
        touch: false,
      },
    },
    locale: 'en-US',

    // Layout properties
    maxHeight: 600,
    displayMode: 'inline',
    safeArea: {
      insets: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    },

    // State properties
    toolInput: {},
    toolOutput: null,
    toolResponseMetadata: null,
    widgetState: null,

    // Methods
    setWidgetState: async function (state) {
      console.log('[OpenAI Mock] setWidgetState called:', state);
      openaiGlobals.widgetState = state;

      // Dispatch event to notify React hooks of the change
      const event = new CustomEvent(SET_GLOBALS_EVENT_TYPE, {
        detail: { globals: { widgetState: state } },
      });
      window.dispatchEvent(event);
    },

    callTool: async function (name, args) {
      console.log('[OpenAI Mock] callTool called:', { name, args });
      return { result: `Mock result for tool: ${name}` };
    },

    sendFollowUpMessage: async function (args) {
      console.log('[OpenAI Mock] sendFollowUpMessage called:', args);
    },

    openExternal: function (payload) {
      console.log('[OpenAI Mock] openExternal called:', payload);
      window.open(payload.href, '_blank');
    },

    requestDisplayMode: async function (args) {
      console.log('[OpenAI Mock] requestDisplayMode called:', args);
      const newMode = args.mode;

      // Update the display mode
      openaiGlobals.displayMode = newMode;

      // Dispatch event to notify React hooks
      const event = new CustomEvent(SET_GLOBALS_EVENT_TYPE, {
        detail: { globals: { displayMode: newMode } },
      });
      window.dispatchEvent(event);

      return { mode: newMode };
    },
  };

  // Expose the mock globally
  window.openai = openaiGlobals;

  // Helper function to update globals from parent
  window.__updateOpenAiGlobals = function (updates) {
    Object.assign(openaiGlobals, updates);

    // Dispatch event to notify React hooks
    const event = new CustomEvent(SET_GLOBALS_EVENT_TYPE, {
      detail: { globals: updates },
    });
    window.dispatchEvent(event);
  };

  // Listen for theme changes from parent
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const updateTheme = (e) => {
    const newTheme = e.matches ? 'dark' : 'light';
    window.__updateOpenAiGlobals({ theme: newTheme });
  };
  mediaQuery.addEventListener('change', updateTheme);
  updateTheme(mediaQuery); // Set initial theme

  // Listen for viewport changes
  const updateLayout = () => {
    const isMobile = window.innerWidth < 768;
    const updates = {
      userAgent: {
        device: { type: isMobile ? 'mobile' : 'desktop' },
        capabilities: {
          hover: !isMobile,
          touch: isMobile,
        },
      },
    };
    window.__updateOpenAiGlobals(updates);
  };
  window.addEventListener('resize', updateLayout);
  updateLayout(); // Set initial values

  console.log('[OpenAI Mock] Initialized window.openai with mock implementation');
})();
