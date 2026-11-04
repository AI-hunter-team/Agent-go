interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  warning: string | null;
}

/** Shared by the game and lab so consent and storage warnings stay consistent. */
export function ModelRememberControl({ checked, disabled, onChange, warning }: Props) {
  return <div>
    <label className="row">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span>在此设备记住密钥</span>
    </label>
    <p className="muted small">{checked
      ? "启用后将密钥及连接令牌保存到当前浏览器，刷新可恢复有效连接。仅在信任的设备上使用；取消勾选会清除保存，保留当前连接。"
      : "密钥及连接令牌仅临时保留在当前页面，刷新后需重新连接。刷新不会自动调用模型。"}</p>
    {warning && <p role="status" className="muted">{warning}</p>}
  </div>;
}
