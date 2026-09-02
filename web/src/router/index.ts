import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import { getSessionToken } from '../api/client';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/trips/:id',
      name: 'trip-detail',
      component: () => import('../views/TripDetailView.vue'),
    },
    {
      path: '/share/:token',
      name: 'trip-share',
      component: () => import('../views/ShareView.vue'),
      props: true,
    },
  ],
});

// 登录守卫：除登录页与只读分享页外，均需登录
router.beforeEach((to) => {
  if (to.path === '/login' || to.path.startsWith('/share/')) return true;
  if (!getSessionToken()) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
