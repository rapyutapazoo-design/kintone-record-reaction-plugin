// 演出（音・振動）の設定。初回スコープでは設定画面に出さず、固定で OFF にする。
export interface Effects {
  sound: boolean;
  haptic: boolean;
}

export const NO_EFFECTS: Effects = { sound: false, haptic: false };
