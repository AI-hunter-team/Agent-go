import type { ReactElement, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";

export function Modal({ title, description, trigger, children, wide = false }: { title: string; description: string; trigger: ReactElement; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className={`dialog-content ${wide ? "dialog-wide" : ""}`}>
      <div className="dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="关闭弹窗">×</button></Dialog.Close></div>
      <Dialog.Description className="muted">{description}</Dialog.Description>{children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function Hint({ text, children }: { text: string; children: ReactElement }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{text}<Tooltip.Arrow /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}
export const TooltipProvider = Tooltip.Provider;
