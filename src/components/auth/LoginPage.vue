<script setup>
import { ref } from 'vue'
import { locale, t } from '../../i18n'
import { login } from '../../lib/auth.js'

const emit = defineEmits(['success', 'skip'])

const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

function tx(key, params) {
  void locale.value
  return t(key, params)
}

async function onLogin() {
  error.value = ''
  busy.value = true
  try {
    await login({ username: username.value, password: password.value })
    password.value = ''
    emit('success')
  } catch (cause) {
    error.value = cause instanceof Error && cause.message ? cause.message : t('auth.loginFail')
  } finally {
    busy.value = false
  }
}

function onSkip() {
  emit('skip')
}
</script>

<template>
  <div class="auth-page" role="region" aria-labelledby="auth-title">
    <header class="auth-page__bar">
      <h1 id="auth-title" class="auth-page__title">{{ tx('auth.title') }}</h1>
    </header>

    <div class="auth-page__body">
      <p class="auth-page__lead">{{ tx('auth.loginHint') }}</p>

      <form class="auth-page__card" @submit.prevent="onLogin">
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
        <button
          class="auth-page__btn auth-page__btn--ghost"
          type="button"
          :disabled="busy"
          @click="onSkip"
        >
          {{ tx('auth.skipLater') }}
        </button>
      </form>
    </div>
  </div>
</template>
