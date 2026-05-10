import { redirect } from "next/navigation";
import { getServerAdminSession } from "../lib/auth-context";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "이메일 또는 비밀번호가 올바르지 않습니다.",
  disabled: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  "mfa-required": "OTP(MFA) 토큰이 필요합니다.",
  "mfa-invalid": "OTP(MFA) 토큰이 올바르지 않습니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, params] = await Promise.all([getServerAdminSession(), searchParams]);

  if (session) {
    redirect("/");
  }

  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "로그인에 실패했습니다." : null;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">Admin sign in</p>
          <h1 id="login-title">쇼핑몰 운영자 로그인</h1>
          <p>관리자 이메일과 비밀번호로 로그인합니다. MFA가 활성화된 계정은 OTP를 함께 입력하세요.</p>
        </div>
        <form className="admin-form" action="/api/v1/auth/login" method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <label>
            OTP (선택)
            <input name="mfaToken" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" />
          </label>
          {errorMessage ? <strong className="form-error">{errorMessage}</strong> : null}
          <button type="submit">로그인</button>
        </form>
      </section>
    </main>
  );
}
