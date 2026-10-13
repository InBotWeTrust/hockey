export function historyDayKey(iso:string):string {
 return new Date(iso).toDateString();
}
export function HistoryDayHeading({iso}:{iso:string}):JSX.Element {
 const date=new Date(iso);
 return <h3 className="social-history-date">{date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',...(date.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})})}</h3>;
}
