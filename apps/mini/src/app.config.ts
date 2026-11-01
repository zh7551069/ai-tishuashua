export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/home/index',
    'pages/pack/domain/index',
    'pages/pack/certificate/index',
    'pages/pack/knowledge/index',
    'pages/legal/terms/index',
    'pages/legal/privacy/index',
    'pages/quiz/index',
    'pages/quiz/progress/index',
    'pages/quiz/paper/index',
    'pages/wrong-book/index',
    'pages/wrong-book/detail/index',
    'pages/certificate/index',
    'pages/score/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '题刷刷',
    navigationBarTextStyle: 'black',
  },
});
