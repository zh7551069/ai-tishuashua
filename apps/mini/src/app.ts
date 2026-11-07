import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { captureGrowthLaunch } from './services/growth-launch-run';
import './app.css';
import './ui.css';

function App({ children }: PropsWithChildren) {
  useLaunch((options) => {
    captureGrowthLaunch(options?.query as Record<string, unknown> | undefined);
  });

  return children;
}

export default App;
