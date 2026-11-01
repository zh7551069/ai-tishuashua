import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import './app.css';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('题刷刷小程序启动');
  });

  return children;
}

export default App;
