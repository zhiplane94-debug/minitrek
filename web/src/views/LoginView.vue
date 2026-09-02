<template>
  <div class="login">
    <div class="login-card">
      <div class="brand">miniTrek</div>
      <p class="sub">家庭旅行规划 · 私有部署</p>

      <form @submit.prevent="onLogin">
        <label for="pw">管理员密码</label>
        <input
          id="pw"
          type="password"
          v-model="password"
          placeholder="请输入密码"
          autofocus
        />
        <div class="status error" v-if="error">{{ error }}</div>
        <button class="btn btn-primary login-btn" :disabled="loading" type="submit">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <details class="recover">
        <summary>忘记密码？</summary>
        <p>在服务器 / NAS 上执行以下命令重置密码：</p>
        <pre>docker exec -it minitrek node --import tsx \
  src/scripts/reset-password.ts</pre>
        <p>
          不传参数会生成随机新密码并打印；也可在后面跟一个 6 位以上新密码。
          重置后旧登录会话立即失效。
        </p>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setSessionToken } from '../api/client';

const route = useRoute();
const router = useRouter();
const password = ref('');
const error = ref('');
const loading = ref(false);

async function onLogin() {
  error.value = '';
  loading.value = true;
  try {
    const r = await api.login(password.value);
    setSessionToken(r.token);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 360px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 32px 28px;
}
.brand {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.5px;
  text-align: center;
}
.sub {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
  margin: 6px 0 22px;
}
form label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
form input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  font-size: 14px;
}
form input:focus {
  border-color: var(--color-primary);
}
.login-btn {
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  font-size: 15px;
}
.status.error {
  color: var(--color-danger);
  font-size: 13px;
  margin-top: 10px;
}
.recover {
  margin-top: 20px;
  border-top: 1px dashed var(--color-border);
  padding-top: 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.recover summary {
  cursor: pointer;
  color: var(--color-primary);
}
.recover pre {
  background: #f1f3f5;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
