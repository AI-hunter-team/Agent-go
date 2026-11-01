/** Small luminous centre; the independent progress stroke always has a transparent interior. */
export function StatusDot() {
  return <div data-alert-badge style={{display:"none",width:14,height:14,position:"relative",pointerEvents:"none"}}>
    <svg width="14" height="14" viewBox="0 0 14 14" style={{position:"absolute",inset:0,overflow:"visible"}} aria-hidden="true">
      <circle cx="7" cy="7" r="5.75" fill="none" stroke="var(--alert-next)" strokeWidth="1.25" opacity=".2"/>
      <circle data-alert-ring cx="7" cy="7" r="5.75" fill="none" stroke="var(--alert-next)" strokeWidth="1.25" strokeLinecap="round" strokeDasharray="36.1283" strokeDashoffset="var(--alert-offset,36.1283)" transform="rotate(-90 7 7)"/>
    </svg>
    <span data-alert-centre style={{position:"absolute",width:5.5,height:5.5,left:4.25,top:4.25,borderRadius:"50%",background:"var(--alert-color)",boxShadow:"0 0 4px 1px var(--alert-color)"}}/>
  </div>;
}
