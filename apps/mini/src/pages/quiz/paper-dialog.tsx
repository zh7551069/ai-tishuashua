import { Button, Text, View } from '@tarojs/components';
import { QUIZ_MODE_LABELS, type QuizMode } from '@tishuashua/shared';
import { ClockIcon, StatusGlyph } from './glyphs';

export function SubmitOverlay(props: {
  mode: QuizMode;
  timerOn: boolean;
  answered: number;
  unanswered: number;
  total: number;
  onContinue: () => void;
  onSubmit: () => void;
}) {
  const exam = props.mode === 'exam';
  const open = props.unanswered > 0;
  const title = open ? `还有 ${props.unanswered} 题未答` : '确定交卷？';
  const body = open
    ? `已答 ${props.answered}/${props.total}。交卷后将结束${exam ? '本场考试' : '本次练习'}并查看成绩，未答题计为未作答。`
    : `已答完全部 ${props.total} 题。交卷后将结束${exam ? '本场考试' : '本次练习'}并查看成绩与解析。`;
  return (
    <View className="dlg-scrim" catchMove onClick={props.onContinue}>
      <View
        className="dlg-card dlg-card-wide"
        catchMove
        onClick={(event) => event.stopPropagation()}
      >
        <StatusGlyph kind={open ? 'warn' : 'check'} />
        <Text className="dlg-title">{title}</Text>
        <Text className="dlg-body">{body}</Text>
        {exam && props.timerOn ? (
          <View className="dlg-hint">
            <ClockIcon />
            <Text className="dlg-hint-text">考试模式 · 限时仍在计时</Text>
          </View>
        ) : null}
        <View className="dlg-actions">
          <Button
            className={open ? 'dlg-btn dlg-btn-primary' : 'dlg-btn dlg-btn-ghost'}
            hoverClass="none"
            onClick={props.onContinue}
          >
            继续答题
          </Button>
          <Button
            className={open ? 'dlg-btn dlg-btn-orange' : 'dlg-btn dlg-btn-primary'}
            hoverClass="none"
            onClick={props.onSubmit}
          >
            确定交卷
          </Button>
        </View>
      </View>
    </View>
  );
}

export function LeaveOverlay(props: {
  mode: QuizMode;
  answered: number;
  total: number;
  onContinue: () => void;
  onLeave: () => void;
}) {
  return (
    <View className="dlg-scrim dlg-scrim-strong" catchMove onClick={props.onContinue}>
      <View
        className="dlg-card dlg-card-wide dlg-card-exit"
        catchMove
        onClick={(event) => event.stopPropagation()}
      >
        <StatusGlyph kind="warn" />
        <Text className="dlg-title">确定退出答题？</Text>
        <Text className="dlg-body">
          {`已答 ${props.answered}/${props.total}。退出将清空此次答题记录，不保存进度、不进入练习记录；已答部分也不保留。`}
        </Text>
        <Text className="dlg-caption">
          {`${QUIZ_MODE_LABELS[props.mode]}模式 · 退出后不可恢复`}
        </Text>
        <View className="dlg-actions">
          <Button className="dlg-btn dlg-btn-muted" hoverClass="none" onClick={props.onContinue}>
            继续答题
          </Button>
          <Button className="dlg-btn dlg-btn-danger" hoverClass="none" onClick={props.onLeave}>
            退出并清空
          </Button>
        </View>
      </View>
    </View>
  );
}
