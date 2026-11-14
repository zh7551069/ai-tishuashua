import { Button, Text, View } from '@tarojs/components';
import { QUIZ_MODE_LABELS, type QuizMode } from '@tishuashua/shared';

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
      <View className="dlg-sheet" catchMove onClick={(event) => event.stopPropagation()}>
        <Text className={open ? 'dlg-sheet-title dlg-sheet-title-warn' : 'dlg-sheet-title'}>
          {title}
        </Text>
        <Text className="dlg-sheet-body">{body}</Text>
        {exam && props.timerOn ? (
          <View className="dlg-chip dlg-chip-warn">
            <Text className="dlg-chip-text">考试模式 · 限时仍在计时</Text>
          </View>
        ) : null}
        <View className="dlg-actions-stack">
          {open ? (
            <>
              <Button
                className="dlg-btn dlg-btn-primary"
                hoverClass="none"
                onClick={props.onContinue}
              >
                继续答题
              </Button>
              <Button className="dlg-btn dlg-btn-line" hoverClass="none" onClick={props.onSubmit}>
                确定交卷
              </Button>
            </>
          ) : (
            <>
              <Button
                className="dlg-btn dlg-btn-primary"
                hoverClass="none"
                onClick={props.onSubmit}
              >
                确定交卷
              </Button>
              <Button className="dlg-btn dlg-btn-line" hoverClass="none" onClick={props.onContinue}>
                继续答题
              </Button>
            </>
          )}
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
      <View className="dlg-sheet" catchMove onClick={(event) => event.stopPropagation()}>
        <Text className="dlg-sheet-title">确定退出答题？</Text>
        <Text className="dlg-sheet-body">
          {`已答 ${props.answered}/${props.total}。退出将清空此次答题记录，不保存进度、不进入练习记录；已答部分也不保留。`}
        </Text>
        <View className="dlg-chip dlg-chip-terra">
          <Text className="dlg-chip-text">
            {`${QUIZ_MODE_LABELS[props.mode]}模式 · 退出后不可恢复`}
          </Text>
        </View>
        <View className="dlg-actions-stack">
          <Button className="dlg-btn dlg-btn-primary" hoverClass="none" onClick={props.onContinue}>
            继续答题
          </Button>
          <Button className="dlg-btn dlg-btn-terra-line" hoverClass="none" onClick={props.onLeave}>
            退出并清空
          </Button>
        </View>
      </View>
    </View>
  );
}
