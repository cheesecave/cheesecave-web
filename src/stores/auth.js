// src/kohaku-hub-ui/src/stores/auth.js
import { defineStore, acceptHMRUpdate } from "pinia";
import { authAPI, settingsAPI } from "@/utils/api";
import { clearRepoSortPreference } from "@/utils/repoSortPreference";
import { KIND, decodeError } from "@/errors";

// One check of the session is enough for a burst of refused requests
const SESSION_CHECK_WINDOW_MS = 30_000;
const INCONCLUSIVE_RECHECK_MS = 5_000;

// 401 is the only answer that means "you are not signed in"; a server that
// is down or slow says nothing about it
const signedOut = (err) => {
  const { kind } = decodeError(err);
  return kind === KIND.AUTH_REQUIRED || kind === KIND.INVALID_CREDENTIALS;
};

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    userOrganizations: [],
    token: localStorage.getItem("hf_token") || null,
    externalTokens: [], // Array of {url, token} for external fallback sources
    loading: false,
    initialized: false,
    // The session ended while the page was open (signed in, then refused)
    sessionExpired: false,
    // The server could not say who we are (down, slow): the sign-in is kept
    verifyError: null,
    checkingSession: false,
    lastSessionCheck: 0,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    username: (state) => state.user?.username || null,
    organizations: (state) => state.userOrganizations,
    organizationNames: (state) =>
      state.userOrganizations.map((org) => org.name),
    // What the banner at the top of the page should say, if anything
    sessionNotice: (state) =>
      state.sessionExpired
        ? "expired"
        : state.verifyError
          ? "unverified"
          : null,
  },

  actions: {
    /**
     * Login user
     * @param {Object} credentials - {username, password}
     */
    async login(credentials) {
      this.loading = true;
      try {
        const { data } = await authAPI.login(credentials);
        // Session cookie is set automatically
        clearRepoSortPreference();
        this.sessionExpired = false;
        this.verifyError = null;
        await this.fetchUserInfo();
        return data;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Register new user
     * @param {Object} userData - {username, email, password}
     */
    async register(userData) {
      this.loading = true;
      try {
        const { data } = await authAPI.register(userData);
        return data;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Logout current user
     */
    async logout() {
      try {
        await authAPI.logout();
      } finally {
        this.user = null;
        this.token = null;
        this.sessionExpired = false;
        localStorage.removeItem("hf_token");
        clearRepoSortPreference();
      }
    },

    /**
     * Fetch current user info
     */
    async fetchUser() {
      try {
        const { data } = await authAPI.me();
        this.user = data;
        return data;
      } catch (err) {
        this.user = null;
        this.userOrganizations = [];
        clearRepoSortPreference();
        throw err;
      }
    },

    /**
     * Fetch user info with organizations
     */
    async fetchUserInfo() {
      try {
        const { data } = await settingsAPI.whoamiV2();
        this.user = {
          username: data.name,
          email: data.email,
          email_verified: data.emailVerified,
          id: data.id,
        };
        this.userOrganizations = data.orgs || [];
        return data;
      } catch (err) {
        if (signedOut(err)) {
          this.user = null;
          this.userOrganizations = [];
          clearRepoSortPreference();
        }
        throw err;
      }
    },

    /**
     * Set token and fetch user
     * @param {string} token - API token
     */
    async setToken(token) {
      this.token = token;
      localStorage.setItem("hf_token", token);
      clearRepoSortPreference();
      await this.fetchUserInfo();
    },

    /**
     * Load user's external tokens from database
     */
    async loadExternalTokens() {
      if (!this.user) {
        this.externalTokens = [];
        return;
      }

      try {
        const { data } = await authAPI.listExternalTokens(this.user.username);
        // Store decrypted tokens (API returns masked preview, need to fetch full tokens)
        // For now, we'll load them when user edits settings
        this.externalTokens = data || [];
      } catch (err) {
        console.error("Failed to load external tokens:", err);
        this.externalTokens = [];
      }
    },

    /**
     * Initialize auth state (restore session on app load)
     */
    async init() {
      if (this.initialized) return;

      this.initialized = true;

      // Try to restore user from session cookie or token
      try {
        await this.fetchUserInfo();
        await this.loadExternalTokens();
      } catch (err) {
        if (signedOut(err)) {
          // Session expired or invalid, clear state
          this.user = null;
          this.userOrganizations = [];
          this.token = null;
          this.externalTokens = [];
          localStorage.removeItem("hf_token");
          clearRepoSortPreference();
        } else {
          // The server did not answer: keep the token, and say we could not tell
          this.verifyError = decodeError(err);
        }
      }
    },

    /** Ask again after "could not verify" (the banner's Retry). */
    async retryVerify() {
      this.verifyError = null;
      this.initialized = false;
      await this.init();
    },

    /**
     * A request was refused for want of a sign-in. If we thought we were signed
     * in, find out whether the session ended: once, however many requests
     * were refused together.
     */
    async handleAuthRequired() {
      if (!this.isAuthenticated || this.checkingSession) return;
      const now = Date.now();
      if (now - this.lastSessionCheck < SESSION_CHECK_WINDOW_MS) return;
      this.checkingSession = true;
      this.lastSessionCheck = now;
      try {
        await settingsAPI.whoamiV2();
      } catch (err) {
        if (signedOut(err)) this.expireSession();
        // could not tell (network, 5xx): look again soon, not in 30 s, or a
        // session that really ended in that window would go unnoticed
        else
          this.lastSessionCheck =
            Date.now() - SESSION_CHECK_WINDOW_MS + INCONCLUSIVE_RECHECK_MS;
      } finally {
        this.checkingSession = false;
      }
    },

    /** The session ended under us: forget the sign-in, and remember why. */
    expireSession() {
      this.user = null;
      this.userOrganizations = [];
      this.token = null;
      this.externalTokens = [];
      this.sessionExpired = true;
      localStorage.removeItem("hf_token");
      clearRepoSortPreference();
    },

    /**
     * Check if user has write access to a namespace
     * @param {string} namespace - Namespace to check
     * @returns {boolean}
     */
    canWriteToNamespace(namespace) {
      if (!this.isAuthenticated) return false;
      // Check if it's user's own namespace or an organization they belong to
      return (
        this.username === namespace ||
        this.organizationNames.includes(namespace)
      );
    },
  },
});

// Hot-replace this store on edit instead of full-reloading the page.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
