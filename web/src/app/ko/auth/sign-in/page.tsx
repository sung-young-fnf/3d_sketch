import { Suspense } from "react";
import SignInForm from "@/components/SignInForm";

export const metadata = { title: "로그인 | Archisketch" };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
