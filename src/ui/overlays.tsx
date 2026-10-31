import type { ReactElement, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";

/** 用同一套线条绘制界面操作图标，图标含义由按钮文字或无障碍名称提供。 */
export function Icon({ name }: { name: "arrow" | "reset" | "close" | "external" }) {
  const paths = { arrow: "M4 9h10m-4-4 4 4-4 4", reset: "M4 6a6 6 0 1 1-1 5M4 2v4H0", close: "m4 4 10 10M14 4 4 14", external: "M4 14 14 4M5 4h9v9" };
  return <svg className="ui-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** 提供焦点受控的弹窗；标题和关闭按钮固定，正文独立滚动。 */
export function Modal({ title, description, trigger, children, wide = false }: { title: string; description: string; trigger: ReactElement; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className={`dialog-content ${wide ? "dialog-wide" : ""}`}>
      <div className="dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="关闭弹窗"><Icon name="close" /></button></Dialog.Close></div>
      <div className="dialog-body"><Dialog.Description className="muted dialog-description">{description}</Dialog.Description>{children}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
/** 为镜头按钮提供鼠标悬停及键盘聚焦时的操作提示。 */
export function Hint({ text, children }: { text: string; children: ReactElement }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{text}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
export const TooltipProvider = Tooltip.Provider;
