"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign up failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-center">
        mail<span className="text-indigo-600">checking</span>
      </h1>
      <p className="text-sm text-gray-500 text-center mt-1 mb-6">
        Create your workspace
      </p>

      <form
        onSubmit={submit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className={inputCls}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className={inputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          required
          minLength={8}
          className={inputCls}
        />
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Invite code"
          className={inputCls}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-gray-500 text-center mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
