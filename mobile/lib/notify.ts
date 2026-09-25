// Alert.alert is a no-op in react-native-web: on web the browser dialogs are
// used instead so success and error messages still reach the user.
import { Alert, Platform, type AlertButton } from 'react-native';

export function notify(title: string, message: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const actions = (buttons ?? []).filter((button) => button.onPress);
  if (actions.length >= 2) {
    // OK runs the first action, Cancel the second.
    const accepted = window.confirm(`${title}\n\n${message}\n\nOK : ${actions[0].text} · Annuler : ${actions[1].text}`);
    (accepted ? actions[0] : actions[1]).onPress?.();
    return;
  }
  window.alert(`${title}\n\n${message}`);
  actions[0]?.onPress?.();
}
