import { Image, Text, View } from '@tarojs/components';
import iconCheck from '../pages/quiz/paper/assets/check-on.png';
import { PAPER_TAG_LABEL, type OptionFace } from '../pages/quiz/paper/option-state';

export function QuizOption(props: {
  optionId: string;
  text: string;
  face: OptionFace;
  onChoose?: (optionId: string) => void;
}) {
  const { face } = props;
  return (
    <View
      className={`paper-option paper-option-${face.tone}`}
      onClick={props.onChoose ? () => props.onChoose?.(props.optionId) : undefined}
    >
      {face.control === 'check' ? (
        face.tone === 'picked' ? (
          <Image className="paper-check" src={iconCheck} mode="aspectFit" />
        ) : (
          <View className="paper-check paper-check-off" />
        )
      ) : (
        <Text className={`paper-letter paper-letter-${face.tone}`}>{props.optionId}</Text>
      )}
      <Text className="paper-option-text">{props.text}</Text>
      {face.tag ? (
        <Text className={`paper-tag paper-tag-${face.tag}`}>{PAPER_TAG_LABEL[face.tag]}</Text>
      ) : null}
    </View>
  );
}
