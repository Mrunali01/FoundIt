"use client";
import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Plus,
  LayoutDashboard,
  Compass,
  FolderHeart,
  Handshake,
  Bell,
  Settings,
  ShieldCheck,
  LocateFixed,
  Headphones,
  Wallet,
  KeyRound,
  BookOpen,
  BottleWine,
  Shirt,
  FileBadge,
  Package,
  Check,
  Upload,
  X,
  LogOut,
  Menu,
  LoaderCircle,
} from "lucide-react";
import {
  categories,
  locations,
  type Report,
  type Store,
  type Profile,
} from "@/lib/types";
import { students } from "@/lib/seed";
type Snapshot = Store & { user: Profile | null; mode: string };
type ReportFields = {
  title: string;
  description: string;
  category: string;
  location_label: string;
  event_date: string;
  color: string;
  brand: string;
};
const navigation = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/explore", "Explore items", Compass],
  ["/my-reports", "My reports", FolderHeart],
  ["/claims", "Claims & handovers", Handshake],
  ["/notifications", "Notifications", Bell],
] as const;
const categoryIcons = [
  Headphones,
  Wallet,
  KeyRound,
  FileBadge,
  Shirt,
  BookOpen,
  BottleWine,
  Package,
];
function ItemIcon({
  category,
  size = 46,
}: {
  category: string;
  size?: number;
}) {
  const Icon =
    categoryIcons[
      categories.indexOf(category as (typeof categories)[number])
    ] || Package;
  return <Icon size={size} strokeWidth={1.3} />;
}
async function post(endpoint: string, body: unknown) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "Please try again");
  return data;
}

type AppState = {
  data: Snapshot | null;
  me: Profile | null | undefined;
  route: string;
  query: Record<string, string>;
  busy: boolean;
  mutate: (body: unknown) => Promise<{ id: string } | null>;
  router: ReturnType<typeof useRouter>;
  load: () => Promise<void>;
};
const AppContext = createContext<AppState | null>(null);
function useApp() {
  const value = useContext(AppContext);
  if (!value) throw Error("App context missing");
  return value;
}

function card(r: Report) {
  return (
    <Link className="item-card" href={`/items/${r.id}`} key={r.id}>
      <div
        className={`item-art art-${categories.indexOf(r.category as (typeof categories)[number])}`}
      >
        <span className={`pill ${r.type}`}>
          {r.type === "lost" ? "Lost" : "Found"}
        </span>
        {r.image ? (
          <img src={r.image} alt={r.title} />
        ) : (
          <div className="object-icon">
            <ItemIcon category={r.category} size={72} />
          </div>
        )}
        <span className="art-arrow">
          <ArrowUpRight size={17} />
        </span>
      </div>
      <div className="card-copy">
        <div className="eyebrow">{r.category}</div>
        <h3>{r.title}</h3>
        <p>
          <MapPin size={13} />
          {r.location_label}
        </p>
        <div className="card-foot">
          <span>
            {new Date(r.event_date + "T12:00:00").toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </span>
          <span className="active-dot">
            {r.status === "active"
              ? r.type === "lost"
                ? "Still looking"
                : "Awaiting owner"
              : r.status.replace("_", " ")}
          </span>
        </div>
      </div>
    </Link>
  );
}

function Matches({ id }: { id: string }) {
  const { data } = useApp();
  const list =
    data?.matches
      .filter((m) => m.lost_report_id === id || m.found_report_id === id)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3) || [];
  return (
    <div className="matches">
      {list.length ? (
        list.map((m) => {
          const r = data?.reports.find(
            (r) =>
              r.id ===
              (m.lost_report_id === id ? m.found_report_id : m.lost_report_id),
          );
          return r ? (
            <Link key={m.id} href={`/items/${r.id}`} className="match">
              <div className="match-icon">
                <ItemIcon category={r.category} size={26} />
              </div>
              <div>
                <strong>{r.title}</strong>
                <p>{m.reasons.join(" · ")}</p>
                <small>Heuristic similarity, not proof of ownership</small>
              </div>
              <b>
                {m.score}
                <small>Match score</small>
              </b>
            </Link>
          ) : null;
        })
      ) : (
        <div className="empty">
          No close matches yet. We’ll keep looking when new reports arrive.
        </div>
      )}
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function Explore({ own = false }: { own?: boolean }) {
  const { route, query } = useApp();
  const [q, setQ] = useState(query.q || ""),
    [type, setType] = useState(query.type || "all"),
    [category, setCategory] = useState(query.category || ""),
    [location, setLocation] = useState(query.location || ""),
    [status, setStatus] = useState(query.status || (own ? "" : "active")),
    [sort, setSort] = useState(query.sort || "newest"),
    [from, setFrom] = useState(query.from || ""),
    [to, setTo] = useState(query.to || ""),
    [limit, setLimit] = useState(9);
  const [results, setResults] = useState<{ reports: Report[]; total: number }>({
    reports: [],
    total: 0,
  });
  const [searchError, setSearchError] = useState(""),
    [searching, setSearching] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      Object.entries({
        q,
        type,
        category,
        location,
        status,
        from,
        to,
        sort,
      }).forEach(([k, v]) => {
        if (v) p.set(k, v);
      });
      window.history.replaceState(null, "", `${route}?${p}`);
      p.set("own", String(own));
      p.set("limit", "9");
      p.set("offset", String(limit - 9));
      setSearching(true);
      setSearchError("");
      fetch(`/api/reports?${p}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw Error("Search is unavailable. Please retry.");
          setResults(await res.json());
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSearchError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, type, category, location, status, from, to, sort, route, own, limit]);
  const reports = results.reports;
  return (
    <>
      <PageHeading
        eyebrow={own ? "YOUR CAMPUS CONTRIBUTION" : "THE CAMPUS NOTICEBOARD"}
        title={
          own
            ? "Your reports, all together."
            : "A little searching. A happy reunion."
        }
        description={
          own
            ? "Follow your reports, review matches, and close the loop."
            : "Something missing? Someone might already have found it."
        }
      />
      <div className="filter-panel">
        <label className="search">
          <Search size={20} />
          <input
            aria-label="Search reports"
            placeholder="Try “black wallet” or “earbuds”…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(9);
            }}
          />
        </label>
        <div className="filter-row">
          <div className="tabs">
            {["all", "lost", "found"].map((t) => (
              <button
                key={t}
                className={type === t ? "selected" : ""}
                onClick={() => {
                  setType(t);
                  setLimit(9);
                }}
              >
                {t === "all"
                  ? "All items"
                  : t === "lost"
                    ? "Lost items"
                    : "Found items"}
              </button>
            ))}
          </div>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setLimit(9);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Location"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setLimit(9);
            }}
          >
            <option value="">Everywhere on campus</option>
            {locations.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setLimit(9);
            }}
          >
            <option value="">All statuses</option>
            {["active", "resolved", "closed"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="date-filters">
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setLimit(9);
              }}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setLimit(9);
              }}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              setQ("");
              setType("all");
              setCategory("");
              setLocation("");
              setFrom("");
              setTo("");
              setStatus("");
              setLimit(9);
            }}
          >
            Clear filters
          </button>
        </div>
      </div>
      <div className="section-heading">
        <p>
          <strong>{results.total}</strong>{" "}
          {own ? "of your reports" : "items on the noticeboard"}
        </p>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setLimit(9);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="relevance">Most relevant</option>
        </select>
      </div>
      {searchError && (
        <p role="alert" className="error">
          {searchError}
        </p>
      )}
      <div className="item-grid" aria-busy={searching}>
        {reports.map(card)}
      </div>
      {!reports.length && !searching && !searchError && (
        <div className="empty">
          <Search />
          <h3>No items here yet</h3>
          <p>Try fewer filters, or report your item so others can help.</p>
        </div>
      )}
      {limit > 9 && (
        <button className="secondary" onClick={() => setLimit(limit - 9)}>
          Previous page
        </button>
      )}
      {limit < results.total && (
        <button
          className="secondary load-more"
          onClick={() => setLimit(limit + 9)}
        >
          Next page
        </button>
      )}
    </>
  );
}

function ReportForm() {
  const [requestId] = useState(() => crypto.randomUUID());
  const { data, me, route, query, busy, mutate, router } = useApp();
  const type = route.endsWith("found") ? "found" : "lost";
  const editId = query.edit || null;
  const existing = data?.reports.find(
    (r) => r.id === editId && r.reporter_id === me?.id,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportFields>({
    defaultValues: existing || {
      category: "Electronics",
      location_label: "Central Library",
      color: "",
      brand: "",
    },
  });
  const [image, setImage] = useState(
      existing?.image_path || existing?.image || "",
    ),
    [preview, setPreview] = useState(""),
    [progress, setProgress] = useState(0),
    [uploading, setUploading] = useState(false),
    [formError, setFormError] = useState("");
  async function upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setFormError("Choose a JPEG, PNG or WebP under 5 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setFormError("");
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      const response = JSON.parse(xhr.responseText);
      if (xhr.status === 200) setImage(response.path);
      else {
        setImage("");
        setFormError(response.error);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setFormError("Connection lost. Select your photo to retry.");
    };
    xhr.send(form);
  }
  return (
    <>
      <PageHeading
        eyebrow={editId ? "UPDATE YOUR REPORT" : "LET’S GET IT HOME"}
        title={
          editId
            ? "A little more detail helps."
            : type === "lost"
              ? "Lost it? Let’s find it."
              : "Found something? Be someone’s hero."
        }
        description="Share the basics publicly. Save secret identifying details for a private claim."
      />
      <form
        className="report-form"
        onSubmit={handleSubmit(async (fields) => {
          setFormError("");
          const r = await mutate({
            ...fields,
            type,
            image,
            action: editId ? "edit" : "report",
            request_id: requestId,
            id: editId,
          });
          if (r) router.push(`/items/${r.id}?created=1`);
        })}
      >
        <section className="panel">
          <h2>
            01 <span>The essentials</span>
          </h2>
          <label>
            What’s the item?
            <input
              {...register("title", {
                required: true,
                minLength: 3,
                maxLength: 100,
              })}
              placeholder="e.g. Black leather wallet"
            />
            {errors.title && (
              <small className="error">
                Add a title with at least 3 characters.
              </small>
            )}
          </label>
          <div className="two-col">
            <label>
              Category
              <select aria-label="Category" {...register("category")}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Date {type === "lost" ? "lost" : "found"}
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                {...register("event_date", { required: true })}
              />
            </label>
          </div>
          <label>
            Approximate campus location
            <select {...register("location_label")}>
              {locations.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              rows={5}
              {...register("description", {
                required: true,
                minLength: 15,
                maxLength: 2000,
              })}
              placeholder="Describe the item and where you last saw it. Avoid personal details."
            />
            {errors.description && (
              <small className="error">Add at least 15 characters.</small>
            )}
          </label>
          <div className="two-col">
            <label>
              Colour <span className="muted">(optional)</span>
              <input {...register("color", { maxLength: 40 })} />
            </label>
            <label>
              Brand <span className="muted">(optional)</span>
              <input {...register("brand", { maxLength: 60 })} />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>
            02 <span>Add a photo</span>
          </h2>
          <p className="muted">
            Optional · JPEG, PNG or WebP · Up to 5 MB · One image
          </p>
          {preview || image ? (
            <div className="upload-preview">
              <img
                src={preview || existing?.image || image}
                alt="Your selected item"
              />
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  if (
                    image &&
                    image !== (existing?.image_path || existing?.image)
                  ) {
                    try {
                      const response = await fetch("/api/images", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: image }),
                      });
                      if (!response.ok) throw Error();
                    } catch {
                      setFormError(
                        "Could not remove the upload. Please retry.",
                      );
                      return;
                    }
                  }
                  if (preview) URL.revokeObjectURL(preview);
                  setImage("");
                  setPreview("");
                }}
                disabled={uploading}
              >
                <X size={16} /> Remove photo
              </button>
            </div>
          ) : null}
          <label className="upload">
            <Upload size={28} />
            <strong>
              {uploading ? `Uploading ${progress}%` : "Choose an item photo"}
            </strong>
            <span>Please crop out names, ID numbers and faces.</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
              }}
            />
          </label>
          {uploading && <progress value={progress} max={100} />}
        </section>
        <div className="safety-note">
          <ShieldCheck />
          <p>
            Keep it safe. Don’t publish phone numbers, student IDs, precise
            storage locations or secret ownership details. Take identity cards
            to campus security.
          </p>
        </div>
        {formError && (
          <p role="alert" className="error">
            {formError}
          </p>
        )}
        <button className="primary" disabled={busy || uploading}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Plus size={18} />
          )}{" "}
          {editId ? "Save changes" : `Publish ${type} report`}
        </button>
      </form>
    </>
  );
}

function Login() {
  const { data, load, router } = useApp();
  const [action, setAction] = useState("login"),
    [message, setMessage] = useState("");
  return (
    <div className="auth-wrap">
      <PageHeading
        eyebrow="WELCOME TO FOUNDIT"
        title="Good things find their way back."
        description="Sign in to report an item, claim a match, or help someone out."
      />
      <section className="panel">
        {data?.mode === "demo" ? (
          <>
            <span className="pill found">Local demo accounts</span>
            <p>
              Fictional accounts for exploring both sides of a recovery. No
              password required in demo mode.
            </p>
            {students.map((p) => (
              <button
                key={p.id}
                className="account"
                onClick={async () => {
                  try {
                    await post("/api/auth", { id: p.id });
                    await load();
                    router.push("/dashboard");
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                <span className="avatar">{p.display_name[0]}</span>
                <span>
                  {p.display_name}
                  <small>{p.role}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                await post("/api/auth", {
                  action,
                  email: form.get("email"),
                  password: form.get("password"),
                });
                await load();
                if (action === "login") router.push("/dashboard");
                else setMessage("Check your email to continue.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            {action !== "reset" && (
              <label>
                Password
                <input type="password" name="password" minLength={8} required />
              </label>
            )}
            <button className="primary">
              {action === "signup"
                ? "Create account"
                : action === "reset"
                  ? "Send reset email"
                  : "Sign in"}
            </button>
            <div className="inline-actions">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setAction(action === "signup" ? "login" : "signup")
                }
              >
                {action === "signup" ? "Sign in instead" : "Create an account"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setAction("reset")}
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}

export function FoundItApp({
  route,
  query,
}: {
  route: string;
  query: Record<string, string>;
}) {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/data${route.startsWith("/items/") ? "?report=" + encodeURIComponent(route.split("/")[2]) : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw Error("Could not load reports. Please try again.");
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [route]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const mutate = async (body: unknown) => {
    setBusy(true);
    try {
      const r = await post("/api/data", body);
      await load();
      return r;
    } catch (e) {
      setToast((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const me = data?.user;
  const reportId = route.startsWith("/items/") ? route.split("/")[2] : null;
  const current = data?.reports.find((r) => r.id === reportId);
  const unread = data?.notifications.filter((n) => !n.read).length || 0;
  const authRequired =
    !["/", "/explore", "/login", "/help", "/privacy"].includes(route) &&
    !reportId;
  return (
    <AppContext.Provider
      value={{ data, me, route, query, busy, mutate, router, load }}
    >
      <div className="app-shell">
        <aside className={mobile ? "sidebar mobile-open" : "sidebar"}>
          <Link href="/" className="brand">
            <span className="brand-mark">
              <LocateFixed size={25} />
            </span>
            found<span>it</span>
            <span className="brand-period">.</span>
          </Link>
          <div className="campus-label">
            <span className="campus-dot" />
            <div>
              Evergreen Campus<small>Bengaluru · fictional demo</small>
            </div>
          </div>
          <div className="nav-label">YOUR CORNER OF CAMPUS</div>
          <nav>
            {navigation.map(([href, label, Icon]) => (
              <Link
                key={href}
                onClick={() => setMobile(false)}
                href={href}
                className={
                  route === href || (href === "/explore" && route === "/")
                    ? "nav-link current"
                    : "nav-link"
                }
              >
                <Icon size={19} />
                {label}
                {href === "/notifications" && unread > 0 && (
                  <span className="count">{unread}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="community-note">
              <div className="tiny-stars">✳</div>
              <strong>Small acts. Big relief.</strong>
              <p>That thing you found could make someone’s whole day.</p>
              <Link href="/report/found">
                Lend a hand <ArrowUpRight size={15} />
              </Link>
            </div>
            <Link className="nav-link" href="/settings">
              <Settings size={18} /> Settings
            </Link>
            {me?.role === "moderator" && (
              <Link className="nav-link" href="/admin">
                <ShieldCheck size={18} /> Moderation
              </Link>
            )}
            <Link className="profile" href={me ? "/settings" : "/login"}>
              <span className="avatar">{me?.display_name[0] || "G"}</span>
              <div>
                {me?.display_name || "Hello, neighbour"}
                <small>
                  {me ? "Campus community" : "Sign in to get started"}
                </small>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="mobile-menu icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <Link className="mobile-brand" href="/">
              foundit.
            </Link>
            <div className="breadcrumb">
              Our campus. <span>A little more connected.</span>
            </div>
            <div className="topbar-actions">
              <span className="demo-indicator">
                {data?.mode === "supabase" ? "CAMPUS MODE" : "LOCAL DEMO"}
              </span>
              <Link
                className="icon-button"
                aria-label={`Notifications, ${unread} unread`}
                href="/notifications"
              >
                <Bell size={20} />
                {unread > 0 && <i />}
              </Link>
              <Link href="/report/found" className="primary small">
                <Plus size={17} /> Report an item
              </Link>
            </div>
          </header>
          <main>
            {error ? (
              <div className="empty" role="alert">
                <p>{error}</p>
                <button
                  onClick={() => {
                    setError("");
                    void load();
                  }}
                >
                  Try again
                </button>
              </div>
            ) : !data ? (
              <div className="skeleton-wrap" aria-busy="true">
                <div className="skeleton hero-skeleton" />
                <div className="item-grid">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton card-skeleton" />
                  ))}
                </div>
              </div>
            ) : authRequired && !me ? (
              <Login />
            ) : route === "/login" ? (
              <Login />
            ) : route === "/" ? (
              <>
                <div className="hero">
                  <div className="hero-copy">
                    <div className="eyebrow">
                      <span className="green-dot" /> LOST & FOUND. RIGHT HERE ON
                      CAMPUS.
                    </div>
                    <h1>
                      Lost something?
                      <br />
                      Let’s bring it{" "}
                      <span>
                        home.
                        <svg viewBox="0 0 240 15" aria-hidden="true">
                          <path d="M2 10 Q110 -2 235 8" />
                        </svg>
                      </span>
                    </h1>
                    <p>
                      For the things you leave behind, and the people who
                      <br className="desktop-break" /> help you find them. Your
                      campus has your back.
                    </p>
                    <div className="hero-actions">
                      <Link className="primary" href="/report/lost">
                        <Search size={18} /> I lost something{" "}
                        <ArrowUpRight size={18} />
                      </Link>
                      <Link className="secondary" href="/report/found">
                        <Plus size={18} /> I found something
                      </Link>
                    </div>
                    <div className="hero-trust">
                      <ShieldCheck size={16} /> Private claims. Safer handovers.
                      Happier reunions.
                    </div>
                  </div>
                  <div
                    className="hero-illustration"
                    aria-label="Illustration of belongings finding their way home"
                  >
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="floating-item float-key">
                      <KeyRound size={46} />
                    </div>
                    <div className="floating-item float-headphones">
                      <Headphones size={65} />
                    </div>
                    <div className="floating-item float-wallet">
                      <Wallet size={57} />
                    </div>
                    <div className="home-label">
                      <span>
                        <Check size={16} />
                      </span>{" "}
                      Back where it belongs <span>↗</span>
                    </div>
                    <div className="illustration-star">✳</div>
                    <div className="illustration-dot" />
                  </div>
                </div>
                <div className="landing-search">
                  <form action="/explore">
                    <Search size={22} />
                    <input
                      name="q"
                      aria-label="Search campus items"
                      placeholder="Looking for something? Try ‘blue bottle’…"
                    />
                    <button className="primary">
                      Search items <ArrowRight size={17} />
                    </button>
                  </form>
                  <div className="quick-categories">
                    <span>A good place to start</span>
                    {[
                      "Electronics",
                      "Bags and wallets",
                      "Keys",
                      "ID cards and documents",
                    ].map((c) => (
                      <Link
                        key={c}
                        href={`/explore?category=${encodeURIComponent(c)}`}
                      >
                        {c}
                        <ArrowUpRight size={12} />
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">THE LATEST AROUND CAMPUS</div>
                    <h2>Missing. Found. Almost home.</h2>
                  </div>
                  <Link className="text-link" href="/explore">
                    Explore all items <ArrowRight size={17} />
                  </Link>
                </div>
                <div className="item-grid">
                  {data.reports
                    .filter((r) => r.status === "active")
                    .slice(0, 6)
                    .map(card)}
                </div>
                <div className="how-it-works">
                  <div>
                    <div className="eyebrow">GOOD THINGS COME FULL CIRCLE</div>
                    <h2>
                      From “where is it?”
                      <br />
                      to “there it is.”
                    </h2>
                  </div>
                  {[
                    [
                      "01",
                      "Share a few details",
                      "Report what’s missing or what you found. A little detail goes a long way.",
                    ],
                    [
                      "02",
                      "Find a familiar match",
                      "We connect the dots between lost and found reports.",
                    ],
                    [
                      "03",
                      "Make a safe return",
                      "Verify ownership privately and meet at a safe campus spot.",
                    ],
                  ].map(([n, t, d]) => (
                    <div key={n}>
                      <span className="step-number">{n}</span>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : route === "/explore" ? (
              <Explore />
            ) : route === "/my-reports" ? (
              <Explore own />
            ) : route.startsWith("/report/") ? (
              <ReportForm />
            ) : reportId ? (
              current ? (
                <>
                  <Link className="text-link" href="/explore">
                    ← Back to explore
                  </Link>
                  {query.created === "1" && (
                    <div className="success" role="status">
                      <Check size={18} /> Report published. We’ve checked for
                      possible matches below.
                    </div>
                  )}
                  <div className="detail-grid">
                    <div
                      className={`detail-art art-${categories.indexOf(current.category as (typeof categories)[number])}`}
                    >
                      {current.image ? (
                        <img src={current.image} alt={current.title} />
                      ) : (
                        <ItemIcon category={current.category} size={150} />
                      )}
                    </div>
                    <section>
                      <span className={`pill ${current.type}`}>
                        {current.type} · {current.status}
                      </span>
                      <h1 className="detail-title">{current.title}</h1>
                      <p className="muted">
                        {current.category} · Reported{" "}
                        {new Date(current.created_at).toLocaleDateString(
                          "en-IN",
                        )}
                      </p>
                      <p className="detail-description">
                        {current.description}
                      </p>
                      <div className="detail-meta">
                        <p>
                          <MapPin size={18} />
                          {current.location_label}
                        </p>
                        <p>
                          Date {current.type}: {current.event_date}
                        </p>
                        {current.color && <p>Colour: {current.color}</p>}
                        {current.brand && <p>Brand: {current.brand}</p>}
                      </div>
                      {current.reporter_id === me?.id ? (
                        <div className="inline-actions">
                          <Link
                            className="secondary"
                            href={`/report/${current.type}?edit=${current.id}`}
                          >
                            Edit report
                          </Link>
                          {current.status === "active" && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    "Close this report? It will leave the public noticeboard.",
                                  )
                                )
                                  await mutate({
                                    action: "status",
                                    id: current.id,
                                    status: "closed",
                                  });
                              }}
                            >
                              Close report
                            </button>
                          )}
                          {current.type === "lost" &&
                            current.status === "active" && (
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={async () => {
                                  if (
                                    window.confirm(
                                      "Confirm that you recovered your item?",
                                    )
                                  )
                                    await mutate({
                                      action: "status",
                                      id: current.id,
                                      status: "resolved",
                                    });
                                }}
                              >
                                I recovered it
                              </button>
                            )}
                        </div>
                      ) : !me ? (
                        <Link className="primary" href="/login">
                          Sign in to{" "}
                          {current.type === "found"
                            ? "claim this item"
                            : "help return it"}
                        </Link>
                      ) : current.type === "found" &&
                        current.status === "active" ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            const r = await mutate({
                              action: "claim",
                              report_id: current.id,
                              message: f.get("message"),
                            });
                            if (r) router.push("/claims");
                          }}
                        >
                          <label>
                            Private ownership evidence
                            <textarea
                              name="message"
                              minLength={15}
                              maxLength={2000}
                              required
                              placeholder="Describe a detail only the owner would know. Never include Aadhaar or bank details."
                            />
                          </label>
                          <button className="primary" disabled={busy}>
                            <Handshake size={18} /> Submit a private claim
                          </button>
                        </form>
                      ) : current.type === "lost" ? (
                        <Link className="primary" href="/report/found">
                          I may have found this <ArrowRight size={17} />
                        </Link>
                      ) : null}
                      {me?.role === "moderator" &&
                        current.reporter_id !== me.id &&
                        current.status === "active" && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Remove this listing from public view and reject its open claims?",
                                )
                              )
                                void mutate({
                                  action: "status",
                                  id: current.id,
                                  status: "closed",
                                });
                            }}
                          >
                            Close listing as moderator
                          </button>
                        )}
                      <button
                        className="text-button flag-button"
                        onClick={async () => {
                          if (!me) {
                            router.push("/login");
                            return;
                          }
                          const reason = window.prompt(
                            "Why should a moderator review this listing?",
                          );
                          if (reason) {
                            const r = await mutate({
                              action: "flag",
                              id: current.id,
                              reason,
                            });
                            if (r)
                              setToast("Report sent to campus moderators.");
                          }
                        }}
                      >
                        Flag a concern
                      </button>
                    </section>
                  </div>
                  <section className="section-space">
                    <div className="section-heading">
                      <h2>Could these be connected?</h2>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void mutate({ action: "refresh" })}
                      >
                        Refresh matches
                      </button>
                    </div>
                    {<Matches id={current.id} />}
                  </section>
                  <div className="safety-note">
                    <ShieldCheck />
                    <p>
                      Similarity helps discovery. It does not verify ownership.
                      Use private evidence and arrange handovers at campus
                      security.
                    </p>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <h1>This report is unavailable</h1>
                  <p>It may have been closed or removed.</p>
                  <Link href="/explore">Explore active reports</Link>
                </div>
              )
            ) : route === "/dashboard" ? (
              <>
                <PageHeading
                  eyebrow="YOUR CAMPUS, LOOKING OUT FOR YOU"
                  title={`Hey ${me?.display_name.split(" ")[0]}, welcome back.`}
                  description="A little help from your community can go a long way."
                />
                <div className="stats-grid">
                  {[
                    [
                      "Active reports",
                      data.reports.filter(
                        (r) =>
                          r.reporter_id === me?.id && r.status === "active",
                      ).length,
                    ],
                    [
                      "Open claims",
                      data.claims.filter((c) =>
                        ["pending", "under_review", "approved"].includes(
                          c.status,
                        ),
                      ).length,
                    ],
                    ["Unread updates", unread],
                  ].map(([label, count]) => (
                    <div className="stat panel" key={label}>
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
                <div className="inline-actions section-space">
                  <Link className="primary" href="/report/lost">
                    <Search size={18} /> Report a lost item
                  </Link>
                  <Link className="secondary" href="/report/found">
                    <Plus size={18} /> I found something
                  </Link>
                </div>
                <div className="section-heading">
                  <h2>Your possible matches</h2>
                  <Link href="/my-reports" className="text-link">
                    My reports <ArrowRight size={16} />
                  </Link>
                </div>
                {data.reports
                  .filter(
                    (r) => r.reporter_id === me?.id && r.status === "active",
                  )
                  .slice(0, 3)
                  .map((r) => (
                    <section className="panel" key={r.id}>
                      <h3>{r.title}</h3>
                      {<Matches id={r.id} />}
                    </section>
                  ))}
                {!data.reports.some((r) => r.reporter_id === me?.id) && (
                  <div className="empty">
                    Your reports and suggested matches will appear here.
                  </div>
                )}
              </>
            ) : route === "/claims" ? (
              <>
                <PageHeading
                  eyebrow="A SAFE RETURN STARTS HERE"
                  title="Claims & handovers"
                  description="Review private evidence carefully. Meet at campus security for a safe handover."
                />
                {data.claims.length ? (
                  data.claims.map((c) => {
                    const r = data.reports.find(
                      (r) => r.id === c.item_report_id,
                    );
                    const reviewer =
                      r?.reporter_id === me?.id || me?.role === "moderator";
                    return (
                      <section className="panel claim-card" key={c.id}>
                        <div className="section-heading">
                          <Link href={`/items/${c.item_report_id}`}>
                            <h2>{r?.title || "Associated report"}</h2>
                          </Link>
                          <span className="pill neutral">
                            {c.status.replace("_", " ")}
                          </span>
                        </div>
                        <small>
                          {c.claimant_id === me?.id
                            ? "Your claim"
                            : "Incoming claim"}{" "}
                          · {new Date(c.created_at).toLocaleDateString("en-IN")}
                        </small>
                        <div className="private-evidence">
                          <ShieldCheck size={17} />
                          <div>
                            <strong>Private ownership evidence</strong>
                            <p>{c.message}</p>
                          </div>
                        </div>
                        {c.review_note && <p>Review note: {c.review_note}</p>}
                        <p className="muted">
                          History:{" "}
                          {c.history
                            .map((h) => h.status.replace("_", " "))
                            .join(" → ")}
                        </p>
                        <div className="inline-actions">
                          {reviewer &&
                            c.claimant_id !== me?.id &&
                            ["pending", "under_review"].includes(c.status) && (
                              <>
                                {c.status === "pending" && (
                                  <button
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void mutate({
                                        action: "review",
                                        id: c.id,
                                        status: "under_review",
                                      })
                                    }
                                  >
                                    Start review
                                  </button>
                                )}
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Have you verified ownership? Only one claim can be approved.",
                                      )
                                    )
                                      void mutate({
                                        action: "review",
                                        id: c.id,
                                        status: "approved",
                                        note:
                                          window.prompt(
                                            "Private handover instructions (optional)",
                                          ) || "",
                                      });
                                  }}
                                >
                                  Approve claim
                                </button>
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    void mutate({
                                      action: "review",
                                      id: c.id,
                                      status: "rejected",
                                      note:
                                        window.prompt(
                                          "Private reason (optional)",
                                        ) || "",
                                    })
                                  }
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          {reviewer &&
                            c.claimant_id !== me?.id &&
                            c.status === "approved" && (
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Confirm the physical handover has happened? This completes the recovery.",
                                    )
                                  )
                                    void mutate({
                                      action: "review",
                                      id: c.id,
                                      status: "completed",
                                    });
                                }}
                              >
                                Confirm completed handover
                              </button>
                            )}
                          {c.claimant_id === me?.id &&
                            ["pending", "under_review", "approved"].includes(
                              c.status,
                            ) && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Withdraw your ownership claim?",
                                    )
                                  )
                                    void mutate({
                                      action: "review",
                                      id: c.id,
                                      status: "withdrawn",
                                    });
                                }}
                              >
                                Withdraw claim
                              </button>
                            )}
                        </div>
                      </section>
                    );
                  })
                ) : (
                  <div className="empty">
                    <Handshake size={35} />
                    <h3>No claims just yet</h3>
                    <p>
                      Find your item on the noticeboard and submit private
                      evidence to begin.
                    </p>
                    <Link className="secondary" href="/explore?type=found">
                      Browse found items
                    </Link>
                  </div>
                )}
              </>
            ) : route === "/notifications" ? (
              <>
                <PageHeading
                  eyebrow="KEEPING YOU IN THE LOOP"
                  title="Your campus updates"
                  description="Matches, claims and the little moments that lead to a reunion."
                />
                <button
                  className="secondary"
                  disabled={busy || !unread}
                  onClick={() => void mutate({ action: "read" })}
                >
                  <Check size={17} /> Mark all as read
                </button>
                <div className="section-space">
                  {data.notifications.length ? (
                    data.notifications.map((n) => (
                      <Link
                        href={`/items/${n.report_id}`}
                        className={`notification panel ${!n.read ? "unread" : ""}`}
                        key={n.id}
                      >
                        <span className="notification-icon">
                          <Bell size={20} />
                        </span>
                        <div>
                          <h3>{n.title}</h3>
                          <p>{n.body}</p>
                          <small>
                            {new Date(n.created_at).toLocaleString("en-IN")}
                          </small>
                        </div>
                        {!n.read && <span className="green-dot" />}
                      </Link>
                    ))
                  ) : (
                    <div className="empty">
                      You’re all caught up. New updates will appear here.
                    </div>
                  )}
                </div>
              </>
            ) : route === "/settings" ? (
              <>
                <PageHeading
                  eyebrow="MAKE YOURSELF AT HOME"
                  title="Your profile & settings"
                  description="Your account information stays private."
                />
                <section className="panel settings-panel">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      const result = await mutate({
                        action: "profile",
                        display_name: form.get("display_name"),
                        match_notifications:
                          form.get("match_notifications") === "on",
                      });
                      if (result) setToast("Profile saved.");
                    }}
                  >
                    <label>
                      Display name
                      <input
                        name="display_name"
                        defaultValue={me?.display_name}
                        required
                        minLength={1}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={me?.email || "Fictional demo account · no email"}
                        readOnly
                      />
                    </label>
                    <label>
                      Campus
                      <input value="Evergreen Campus · Bengaluru" readOnly />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="match_notifications"
                        defaultChecked={me?.match_notifications !== false}
                      />{" "}
                      Notify me about new matches
                    </label>
                    <p className="muted">
                      Claim and recovery updates always appear in your
                      notification centre.
                    </p>
                    <button className="primary" disabled={busy}>
                      Save profile
                    </button>
                  </form>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      try {
                        await post("/api/auth", {
                          action: "password",
                          password: form.get("password"),
                        });
                        setToast("Password updated.");
                      } catch (e) {
                        setToast((e as Error).message);
                      }
                    }}
                  >
                    {data.mode === "supabase" && (
                      <>
                        <label>
                          New password
                          <input
                            name="password"
                            type="password"
                            required
                            minLength={8}
                          />
                        </label>
                        <button className="secondary">Update password</button>
                      </>
                    )}
                  </form>
                  <div className="inline-actions">
                    <button
                      className="secondary"
                      onClick={async () => {
                        await post("/api/auth", { action: "logout" });
                        await load();
                        router.push("/login");
                      }}
                    >
                      <LogOut size={17} /> Sign out
                    </button>
                    <Link className="text-link" href="/help">
                      Account deletion request
                    </Link>
                  </div>
                </section>
              </>
            ) : route === "/admin" ? (
              me?.role === "moderator" ? (
                <>
                  <PageHeading
                    eyebrow="CAMPUS MODERATION"
                    title="Keep the community safe."
                    description="Review concerns and resolve disputed listings."
                  />
                  <div className="stats-grid">
                    <div className="panel stat">
                      <span>Available reports</span>
                      <strong>{data.reports.length}</strong>
                    </div>
                    <div className="panel stat">
                      <span>Pending flags</span>
                      <strong>
                        {
                          data.flags.filter((f) => f.status === "pending")
                            .length
                        }
                      </strong>
                    </div>
                  </div>
                  <h2 className="section-space">Flagged reports</h2>
                  {data.flags.length ? (
                    data.flags.map((f) => (
                      <section className="panel" key={f.id}>
                        <Link href={`/items/${f.report_id}`}>
                          Open associated report <ArrowUpRight size={15} />
                        </Link>
                        <p>{f.reason}</p>
                        <span className="pill neutral">{f.status}</span>
                        {f.status === "pending" && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate({ action: "moderate", id: f.id })
                            }
                          >
                            Mark reviewed
                          </button>
                        )}
                      </section>
                    ))
                  ) : (
                    <div className="empty">No flags awaiting review.</div>
                  )}
                  <Link className="secondary" href="/claims">
                    Review claims and disputes
                  </Link>
                </>
              ) : (
                <div className="empty">
                  <ShieldCheck />
                  <h1>Moderator access required</h1>
                  <p>Your account does not have permission to moderate.</p>
                </div>
              )
            ) : route === "/privacy" || route === "/help" ? (
              <>
                <PageHeading
                  eyebrow="LOOKING OUT FOR EACH OTHER"
                  title={
                    route === "/privacy"
                      ? "Privacy, by design."
                      : "A little help, when you need it."
                  }
                  description="FoundIt is a campus community utility."
                />
                <section className="panel prose">
                  <h2>Safe reporting and handovers</h2>
                  <p>
                    Publish only general descriptions and approximate campus
                    locations. Keep names, phone numbers, student ID numbers,
                    and identifying secrets out of reports and photos. Return
                    identity documents through campus security.
                  </p>
                  <h2>Private claims</h2>
                  <p>
                    Claim messages are visible only to the claimant, report
                    owner and authorized campus moderators. A match score is a
                    heuristic similarity score and never verifies ownership.
                  </p>
                  <h2>Account deletion and reporting concerns</h2>
                  <p>
                    Contact your campus’s authorized lost-and-found office in
                    person to request deletion. The office must verify your
                    account before a database administrator deletes your Auth
                    user and associated personal records. This MVP has no
                    automated deletion request queue. Use “Flag a concern” on an
                    item to request listing review.
                  </p>
                  <h2>Local demo</h2>
                  <p>
                    The fictional demo is stored in .data on the development
                    server. It is shared by browsers using this server. Demo
                    accounts are freely selectable and must never be used with
                    real personal information.
                  </p>
                </section>
              </>
            ) : (
              <div className="empty">
                <h1>Page not found</h1>
                <Link href="/">Back home</Link>
              </div>
            )}
          </main>
          <footer>
            <Link className="footer-brand" href="/">
              foundit.
            </Link>
            <span>A little kindness. A lot of happy reunions.</span>
            <div>
              <Link href="/help">Help & safety</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/help">Report a concern</Link>
            </div>
          </footer>
        </div>
        {toast && (
          <div role="status" className="toast">
            <span>{toast}</span>
            <button aria-label="Dismiss message" onClick={() => setToast("")}>
              <X size={17} />
            </button>
          </div>
        )}
        <nav className="bottom-nav">
          <Link href="/explore">
            <Compass size={20} />
            Explore
          </Link>
          <Link href="/my-reports">
            <FolderHeart size={20} />
            My reports
          </Link>
          <Link href="/report/found">
            <Plus size={23} />
            Report
          </Link>
          <Link href="/claims">
            <Handshake size={20} />
            Claims
          </Link>
        </nav>
      </div>
    </AppContext.Provider>
  );
}
