/**
 * Header right-hand cluster, per spec section 4:
 *   크레딧 5.6 · 언어 토글 · 채팅/알림 아이콘(배지 26) · 아바타 + 에프앤에프 / fnf@archisketch.com
 * All values are static in the clone - there is no payment/notification service.
 */
export default function Header() {
  return (
    <header className="header">
      <div className="header__credit" title="payment/v1/credit/balance (고정값)">
        <span aria-hidden>◉</span>
        <span>크레딧 5.6</span>
      </div>
      <div className="header__lang" title="표시만 - 전환 없음">
        <span className="is-on">KO</span>
        <span>EN</span>
      </div>
      <span className="header__icon" title="채팅">
        ✉
      </span>
      <span className="header__icon" title="알림">
        🔔
        <span className="header__badge">26</span>
      </span>
      <div className="header__user">
        <span className="header__avatar">F&amp;F</span>
        <span>
          <span className="header__user-name" style={{ display: "block" }}>
            에프앤에프
          </span>
          <span className="header__user-mail" style={{ display: "block" }}>
            fnf@archisketch.com
          </span>
        </span>
      </div>
    </header>
  );
}
