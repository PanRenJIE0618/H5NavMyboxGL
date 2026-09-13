<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { locale, t } from '../../i18n'
import { getUser, isLoggedIn, login, logout, onAuthChange } from '../../lib/auth.js'

const username = ref('')
const password = ref('')
const loggedIn = ref(isLoggedIn())
const user = ref(getUser())
const busy = ref(false)
const error = ref('')

function tx(key, params) {
  void locale.value
  return t(key, params)
}

function applyAuth(state) {
  loggedIn.value = Boolean(state?.isLoggedIn)
  user.value = state?.user ?? null
}

let unsubscribe = () => {}

onMounted(() => {
  applyAuth({ user: getUser(), isLoggedIn: isLoggedIn() })
  unsubscribe = onAuthChange(applyAuth)
})

onUnmounted(() => unsubscribe())

async function onLogin() {
  error.value = ''
  busy.value = true
  try {
    await login({ username: username.value, password: password.value })
    password.value = ''
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('auth.loginFail')
  } finally {
    busy.value = false
  }
}

async function onLogout() {
  error.value = ''
  busy.value = true
  try {
    await logout()
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('auth.loginFail')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-page" role="region" :aria-labelledby="loggedIn ? 'auth-user-title' : 'auth-title'">
    <header class="auth-page__bar">
      <h1 :id="loggedIn ? 'auth-user-title' : 'auth-title'" class="auth-page__title">
        {{ tx('auth.title') }}
      </h1>
    </header>

    <div class="auth-page__body">
      <section v-if="loggedIn" class="auth-page__card auth-page__card--session">
        <p class="auth-page__status" role="status">
          {{ tx('auth.loggedInAs', { name: user?.name || '' }) }}
        </p>
        <button
          class="auth-page__btn auth-page__btn--ghost"
          type="button"
          :disabled="busy"
          @click="onLogout"
        >
          {{ tx('auth.logout') }}
        </button>
      </section>

      <form v-else class="auth-page__card" @submit.prevent="onLogin">
        <label class="auth-page__field">
          <span>{{ tx('auth.username') }}</span>
          <input
            v-model="username"
            type="text"
            name="username"
            autocomplete="username"
            inputmode="text"
            :disabled="busy"
          />
        </label>
        <label class="auth-page__field">
          <span>{{ tx('auth.password') }}</span>
          <input
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            :disabled="busy"
          />
        </label>
        <p v-if="error" class="auth-page__error" role="alert">{{ error }}</p>
        <button class="auth-page__btn" type="submit" :disabled="busy">
          {{ tx('auth.login') }}
        </button>
      </form>
    </div>
  </div>
</template>
