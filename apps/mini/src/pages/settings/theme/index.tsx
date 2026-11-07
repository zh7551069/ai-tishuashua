import { Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { readThemeId, saveThemeId, THEMES, type ThemeId } from '../../../services/local-prefs';
import { ThemeBack, ThemeCheck } from '../../../ui/glyphs';
import '../../../ui/me-settings.css';

export default function ThemePage() {
  const [themeId, setThemeId] = useState<ThemeId>('blue');

  useDidShow(() => {
    setThemeId(readThemeId());
  });

  const pick = (id: ThemeId) => {
    saveThemeId(id);
    setThemeId(id);
  };

  return (
    <Screen back centerTitle navPlain navClassName="ms-nav" title="主题色" backMark={<ThemeBack />}>
      <View className={`ms-theme-${themeId}`}>
        <View className="ms-body ms-body-theme">
          <View className="ms-card ms-intro">
            <Text className="ms-intro-title">选择 App 主色调</Text>
            <Text className="ms-intro-sub">主按钮、选中态与强调色会一起更新</Text>
          </View>
          <View className="ms-card">
            {THEMES.map((theme, index) => {
              const selected = theme.id === themeId;
              return (
                <View key={theme.id}>
                  {index > 0 ? <View className="ms-line-theme" /> : null}
                  <View className="ms-theme-row" onClick={() => pick(theme.id)}>
                    <View className="ms-color-wrap">
                      <View
                        className={selected ? 'ms-color' : 'ms-color ms-dim'}
                        style={{ background: theme.color }}
                      >
                        {selected ? <ThemeCheck /> : null}
                      </View>
                    </View>
                    <Text className={selected ? 'ms-theme-name' : 'ms-theme-name ms-dim'}>
                      {theme.name}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <View className="ms-card ms-preview">
            <Text className="ms-preview-kicker">预览</Text>
            <View className="ms-chip ms-brand-soft ms-brand-chip">
              <Text className="ms-chip-text ms-brand-fg">练习模式</Text>
            </View>
            <View className="ms-preview-btn ms-brand-bg">
              <Text className="ms-preview-text">AI 开始出题</Text>
            </View>
          </View>
          <Text className="ms-hint">点选即生效 · 返回设置可查看入口色标</Text>
        </View>
      </View>
    </Screen>
  );
}
