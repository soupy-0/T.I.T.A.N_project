// User request: Final corrective pass with chart/map color fixes, improved responsive/container-query behavior, complete nav icon rail, verified-state workflow correction, modal accessibility/focus handling, and stabilized top-level reusable table/map components.
import * as React from "react"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
} from "react-leaflet"

type NavKey =
    | "Overview"
    | "Shipments"
    | "Live Tracking"
    | "Sensor Analytics"
    | "Blockchain Verification"
    | "Alerts"
    | "Settings"
type Status = "In transit" | "Delivered" | "Attention" | "Pending"
type UIMode = "ready" | "loading" | "empty" | "error" | "disconnected"
type VerifyState = "pending" | "busy" | "signed" | "failed" | "verified"
type VerifyStage = "initiation" | "completion"

interface Shipment {
    id: string
    origin: string
    destination: string
    status: Status
    temperature: number
    humidity: number
    lat: number
    lon: number
    supplier: string
    nfcId: string
    signatureState: "Signed" | "Pending" | "Failed"
    lastSeen: string
    cargo: string
    latestIso: string
}

interface AlertItem {
    id: string
    shipmentId: string
    severity: "Low" | "Medium" | "High"
    message: string
    timestamp: string
    acknowledged: boolean
}

interface VerifyHistory {
    id: string
    action: string
    status: VerifyState
    timestamp: string
    note: string
}

interface ReadingPoint {
    t: string
    temp: number
    humidity: number
}

interface TitanAppProps {
    brandTitle: string
    backgroundColor: string
    surfaceColor: string
    accentColor: string
    textColor: string
    mutedColor: string
    sidebarColor: string
    borderColor: string
    successColor: string
    warningColor: string
    cyanColor: string
    font: any
    simulationEnabled: boolean
    style?: React.CSSProperties
}

function softColor(color: string, amount = 16) {
    return `color-mix(in srgb, ${color} ${amount}%, transparent)`
}

function Icon({
    name,
    size = 16,
    color = "currentColor",
}: {
    name: string
    size?: number
    color?: string
}) {
    const common = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: color,
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    }
    const paths: Record<string, React.ReactNode> = {
        Menu: <path d="M4 7h16M4 12h16M4 17h16" />,
        Shield: (
            <>
                <path d="M12 3 5 6v6c0 4.6 3 7.9 7 9 4-1.1 7-4.4 7-9V6z" />
                <path d="m9 12 2 2 4-4" />
            </>
        ),
        Search: (
            <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
            </>
        ),
        Bell: (
            <>
                <path d="M18 16H6l1.2-1.6V10a4.8 4.8 0 0 1 9.6 0v4.4z" />
                <path d="M10.8 19a1.8 1.8 0 0 0 2.4 0" />
            </>
        ),
        Close: <path d="m6 6 12 12M18 6 6 18" />,
        Plus: <path d="M12 5v14M5 12h14" />,
        Overview: (
            <path d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z" />
        ),
        Shipments: (
            <>
                <path d="M3 7h12v10H3z" />
                <path d="M15 10h4l2 2v5h-6z" />
                <circle cx="7" cy="18" r="1.5" />
                <circle cx="17" cy="18" r="1.5" />
            </>
        ),
        Tracking: (
            <>
                <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
                <circle cx="12" cy="10" r="2.5" />
            </>
        ),
        Analytics: <path d="M4 19V5M10 19v-8M16 19v-5M22 19V9" />,
        Chain: (
            <>
                <rect x="3" y="7" width="8" height="10" rx="2" />
                <rect x="13" y="7" width="8" height="10" rx="2" />
                <path d="M11 12h2" />
            </>
        ),
        Alerts: (
            <>
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <path d="M12 9v5M12 17h.01" />
            </>
        ),
        Settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M19 12h2M3 12h2M12 3v2M12 19v2M17.6 6.4l1.4-1.4M5 19l1.4-1.4M6.4 6.4 5 5M19 19l-1.4-1.4" />
            </>
        ),
    }
    return <svg {...common}>{paths[name] || paths.Menu}</svg>
}

function StatusBadge({
    label,
    muted,
    success,
    warning,
    cyan,
}: {
    label: string
    muted: string
    success: string
    warning: string
    cyan: string
}) {
    const tone =
        label === "Delivered" || label === "signed" || label === "verified"
            ? success
            : label === "Attention" || label === "failed" || label === "High"
              ? warning
              : label === "Pending" || label === "pending"
                ? muted
                : cyan
    return (
        <span
            style={{
                border: `1px solid ${softColor(tone, 40)}`,
                color: tone,
                background: softColor(tone, 14),
                borderRadius: 999,
                fontSize: 11,
                padding: "4px 8px",
                display: "inline-block",
                minWidth: 72,
                textAlign: "center",
                boxSizing: "border-box",
            }}
        >
            {label}
        </span>
    )
}

function ChartCard(props: {
    title: string
    unit: string
    value: number
    seed: number
    color: string
    muted: string
    border: string
    range: string
    threshold: number
    min: number
    max: number
}) {
    const {
        title,
        unit,
        value,
        seed,
        color,
        muted,
        border,
        range,
        threshold,
        min,
        max,
    } = props
    const [hover, setHover] = React.useState<number | null>(null)
    const points = React.useMemo(() => {
        const base = title.includes("Humidity") ? 60 : 5
        const amp = title.includes("Humidity") ? 9 : 2
        return Array.from({ length: 12 }, (_, i) =>
            Number(
                (
                    base +
                    Math.sin(i * 0.63 + seed) * amp +
                    (i % 3) * (title.includes("Humidity") ? 0.8 : 0.25)
                ).toFixed(1)
            )
        )
    }, [seed, title])
    const yFor = (v: number) => 116 - ((v - min) / (max - min)) * 86
    return (
        <section
            style={{
                border: `1px solid ${border}`,
                borderRadius: 12,
                background: "#101722",
                padding: 12,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 12, color: muted }}>{range}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 650 }}>
                {value.toFixed(1)}
                {unit}
            </div>
            <svg width="100%" height="130" viewBox="0 0 320 130">
                <line x1="40" y1="116" x2="314" y2="116" stroke={border} />
                <line x1="40" y1="22" x2="40" y2="116" stroke={border} />
                <line
                    x1="40"
                    y1={yFor(threshold)}
                    x2="314"
                    y2={yFor(threshold)}
                    stroke={softColor("#F59E0B", 70)}
                    strokeDasharray="4 4"
                />
                <text x="4" y="26" fill={muted} fontSize="10">
                    {max.toFixed(0)}
                </text>
                <text x="4" y="120" fill={muted} fontSize="10">
                    {min.toFixed(0)}
                </text>
                <path
                    d={points
                        .map(
                            (p, i) =>
                                `${i ? "L" : "M"} ${40 + (i * 274) / 11} ${yFor(p)}`
                        )
                        .join(" ")}
                    stroke={color}
                    fill="none"
                    strokeWidth="2.2"
                />
                <path
                    d={`${points.map((p, i) => `${i ? "L" : "M"} ${40 + (i * 274) / 11} ${yFor(p)}`).join(" ")} L 314 116 L 40 116 Z`}
                    fill={color}
                    fillOpacity={0.1}
                />
                {points.map((p, i) => (
                    <circle
                        key={i}
                        cx={40 + (i * 274) / 11}
                        cy={yFor(p)}
                        r={hover === i ? 4 : 2.5}
                        fill={color}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                    />
                ))}
                <text x="40" y="128" fill={muted} fontSize="10">
                    00:00
                </text>
                <text x="154" y="128" fill={muted} fontSize="10">
                    12:00
                </text>
                <text x="286" y="128" fill={muted} fontSize="10">
                    24:00
                </text>
            </svg>
            <div style={{ fontSize: 12, color: muted }}>
                {hover === null
                    ? "Hover for reading"
                    : `Reading ${points[hover].toFixed(1)}${unit}`}
            </div>
        </section>
    )
}

function AppModal({
    open,
    onClose,
    title,
    children,
    border,
    closeRef,
}: {
    open: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    border: string
    closeRef?: React.RefObject<HTMLButtonElement | null>
}) {
    const panelRef = React.useRef<HTMLDivElement | null>(null)
    const titleId = React.useId()
    const previousFocus = React.useRef<HTMLElement | null>(null)
    React.useEffect(() => {
        if (!open) return
        if (typeof document !== "undefined") {
            previousFocus.current = document.activeElement as HTMLElement
            window.setTimeout(() => panelRef.current?.focus(), 0)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
            if (e.key === "Tab" && panelRef.current) {
                const nodes = panelRef.current.querySelectorAll<HTMLElement>(
                    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
                )
                if (!nodes.length) return
                const first = nodes[0]
                const last = nodes[nodes.length - 1]
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault()
                    last.focus()
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }
        if (typeof window !== "undefined")
            window.addEventListener("keydown", onKey)
        return () => {
            if (typeof window !== "undefined")
                window.removeEventListener("keydown", onKey)
            previousFocus.current?.focus?.()
        }
    }, [open, onClose])
    if (!open) return null
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={{
                position: "fixed",
                inset: 0,
                background: softColor("#000000", 55),
                zIndex: 80,
                padding: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                style={{
                    width: "min(860px,100%)",
                    maxHeight: "92vh",
                    overflow: "auto",
                    border: `1px solid ${border}`,
                    borderRadius: 12,
                    background: "#0F1624",
                    padding: 16,
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                    }}
                >
                    <strong id={titleId}>{title}</strong>
                    <button
                        ref={closeRef}
                        aria-label="Close modal"
                        onClick={onClose}
                        style={{
                            borderRadius: 10,
                            border: `1px solid ${border}`,
                            background: "#101722",
                            color: "#EDF2FA",
                            padding: "10px 12px",
                        }}
                    >
                        <Icon name="Close" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}

function ShipmentTable(props: {
    compact?: boolean
    rows: Shipment[]
    search: string
    statusFilter: string
    setSearch: (v: string) => void
    setStatusFilter: (v: string) => void
    borderColor: string
    mutedColor: string
    successColor: string
    warningColor: string
    cyanColor: string
    accentColor: string
    buttonStyle: React.CSSProperties
    inputStyle: React.CSSProperties
    onCreate: () => void
    onDetail: (id: string) => void
}) {
    const {
        compact = false,
        rows,
        search,
        statusFilter,
        setSearch,
        setStatusFilter,
        borderColor,
        mutedColor,
        successColor,
        warningColor,
        cyanColor,
        accentColor,
        buttonStyle,
        inputStyle,
        onCreate,
        onDetail,
    } = props
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                    aria-label="Shipment table search"
                    value={search}
                    onChange={(e) =>
                        React.startTransition(() => setSearch(e.target.value))
                    }
                    placeholder="Filter by ID, route, supplier…"
                    style={{
                        ...inputStyle,
                        width: compact ? 220 : 340,
                        maxWidth: "100%",
                    }}
                />
                <select
                    style={{ ...inputStyle, width: 160 }}
                    aria-label="Status filter"
                    value={statusFilter}
                    onChange={(e) =>
                        React.startTransition(() =>
                            setStatusFilter(e.target.value)
                        )
                    }
                >
                    {[
                        "All",
                        "In transit",
                        "Delivered",
                        "Attention",
                        "Pending",
                    ].map((x) => (
                        <option key={x}>{x}</option>
                    ))}
                </select>
                {!compact && (
                    <button
                        style={{ ...buttonStyle, background: accentColor }}
                        onClick={onCreate}
                    >
                        Create shipment
                    </button>
                )}
            </div>
            {rows.length === 0 ? (
                <div
                    style={{
                        border: `1px solid ${borderColor}`,
                        borderRadius: 12,
                        padding: 20,
                        textAlign: "center",
                        color: mutedColor,
                    }}
                >
                    No shipments match current filters.
                </div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 13,
                        }}
                    >
                        <thead>
                            <tr
                                style={{ color: mutedColor, textAlign: "left" }}
                            >
                                <th style={{ padding: 12 }}>ID</th>
                                <th style={{ padding: 12 }}>Route</th>
                                <th style={{ padding: 12 }}>Status</th>
                                <th style={{ padding: 12 }}>Temp</th>
                                {!compact && (
                                    <>
                                        <th style={{ padding: 12 }}>
                                            Humidity
                                        </th>
                                        <th style={{ padding: 12 }}>Coords</th>
                                        <th style={{ padding: 12 }}>
                                            Signature
                                        </th>
                                    </>
                                )}
                                <th style={{ padding: 12 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((s) => (
                                <tr
                                    key={s.id}
                                    style={{
                                        borderTop: `1px solid ${borderColor}`,
                                    }}
                                >
                                    <td
                                        style={{
                                            padding: 12,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {s.id}
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        {s.origin}→{s.destination}
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        <StatusBadge
                                            label={s.status}
                                            muted={mutedColor}
                                            success={successColor}
                                            warning={warningColor}
                                            cyan={cyanColor}
                                        />
                                    </td>
                                    <td style={{ padding: 12 }}>
                                        {s.temperature.toFixed(1)}°C
                                    </td>
                                    {!compact && (
                                        <>
                                            <td style={{ padding: 12 }}>
                                                {s.humidity.toFixed(1)}%
                                            </td>
                                            <td style={{ padding: 12 }}>
                                                {s.lat.toFixed(2)},{" "}
                                                {s.lon.toFixed(2)}
                                            </td>
                                            <td style={{ padding: 12 }}>
                                                {s.signatureState}
                                            </td>
                                        </>
                                    )}
                                    <td style={{ padding: 12 }}>
                                        <button
                                            style={buttonStyle}
                                            onClick={() => onDetail(s.id)}
                                        >
                                            Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// Geographic coordinates for route endpoints (WGS84 decimal degrees).
// Shipment positions themselves always come from each shipment's lat/lon fields.
const MAP_CITIES: Record<string, [number, number]> = {
    Rotterdam: [51.9244, 4.4777], Hamburg: [53.5511, 9.9937],
    Berlin: [52.52, 13.405], Paris: [48.8566, 2.3522],
    Milan: [45.4642, 9.19], Warsaw: [52.2297, 21.0122],
    Prague: [50.0755, 14.4378],
}

function MapCard(props: {
    large?: boolean
    selected: Shipment
    shipments: Shipment[]
    selectedId: string
    setSelectedId: (id: string) => void
    mapState: { zoom: number; x: number; y: number }
    setMapState: (updater: (prev: { zoom: number; x: number; y: number }) => { zoom: number; x: number; y: number }) => void
    borderColor: string
    surfaceColor: string
    mutedColor: string
    textColor: string
    accentColor: string
    cyanColor: string
    buttonStyle: React.CSSProperties
}) {
    const {
        selected,
        shipments,
        selectedId,
        setSelectedId,
        borderColor,
        surfaceColor,
        mutedColor,
        textColor,
        accentColor,
        cyanColor,
    } = props

    const makeIcon = (active: boolean) =>
        L.divIcon({
            className: "",
            html: `<div style="
                width:${active ? 18 : 14}px;
                height:${active ? 18 : 14}px;
                border:2px solid white;
                border-radius:50%;
                background:${active ? accentColor : cyanColor};
                box-shadow:0 0 0 4px ${active ? accentColor : cyanColor}55;
            "></div>`,
            iconSize: [active ? 22 : 18, active ? 22 : 18],
            iconAnchor: [active ? 11 : 9, active ? 11 : 9],
        })

    return (
        <section
            style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                background: surfaceColor,
                padding: 16,
                minWidth: 0,
            }}
        >
            <div
                className="map-header"
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                }}
            >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                    Live shipment tracking
                </div>
                <div style={{ fontSize: 12, color: mutedColor }}>
                    Europe · LIVE MAP
                </div>
            </div>

            <MapContainer
                center={[50.6, 10.3]}
                zoom={5}
                minZoom={3}
                maxZoom={18}
                scrollWheelZoom={true}
                style={{
                    height: 400,
                    width: "100%",
                    borderRadius: 12,
                    background: "#101b28",
                    zIndex: 0,
                }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    subdomains={["a", "b", "c"]}
                />

                {shipments.map((shipment) => {
                    const from = MAP_CITIES[shipment.origin]
                    const to = MAP_CITIES[shipment.destination]

                    if (!from || !to) return null

                    return (
                        <Polyline
                            key={`route-${shipment.id}`}
                            positions={[from, to]}
                            pathOptions={{
                                color:
                                    shipment.id === selectedId
                                        ? accentColor
                                        : cyanColor,
                                weight: shipment.id === selectedId ? 4 : 2,
                                opacity:
                                    shipment.id === selectedId ? 0.9 : 0.45,
                                dashArray: "7 7",
                            }}
                        />
                    )
                })}

                {shipments.map((shipment) => {
                    if (
                        !Number.isFinite(shipment.lat) ||
                        !Number.isFinite(shipment.lon) ||
                        shipment.lat < -90 ||
                        shipment.lat > 90 ||
                        shipment.lon < -180 ||
                        shipment.lon > 180
                    ) {
                        return null
                    }

                    const active = shipment.id === selectedId

                    return (
                        <Marker
                            key={`marker-${shipment.id}`}
                            position={(() => {
    const from = MAP_CITIES[shipment.origin]
    const to = MAP_CITIES[shipment.destination]

    if (!from || !to) {
        return [shipment.lat, shipment.lon] as [number, number]
    }

    // Stable simulated position along the correct route.
    const progress = 0.5

    return [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
    ] as [number, number]
})()}
                            icon={makeIcon(active)}
                            eventHandlers={{
                                click: () => setSelectedId(shipment.id),
                            }}
                        >
                            <Popup>
                                <div style={{ minWidth: 170, color: "#172033" }}>
                                    <strong>{shipment.id}</strong>
                                    <div>
                                        {shipment.origin} → {shipment.destination}
                                    </div>
                                    <div>Status: {shipment.status}</div>
                                    <div>
                                        Temperature: {shipment.temperature.toFixed(1)}°C
                                    </div>
                                    <div>
                                        Humidity: {shipment.humidity.toFixed(1)}%
                                    </div>
                                    <div>Supplier: {shipment.supplier}</div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                })}
            </MapContainer>

            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    marginTop: 12,
                    fontSize: 12,
                    color: mutedColor,
                }}
            >
                <span>
                    <span style={{ color: accentColor }}>●</span> Selected shipment
                </span>
                <span>
                    <span style={{ color: cyanColor }}>●</span> Other shipments
                </span>
                <span>Dashed lines: planned routes</span>
            </div>

            <div
                style={{
                    marginTop: 10,
                    padding: 12,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    color: textColor,
                    fontSize: 12,
                }}
            >
                <strong>{selected.id}</strong>
                {" · "}
                {selected.origin} → {selected.destination}
                <div style={{ color: mutedColor, marginTop: 4 }}>
                    {selected.temperature.toFixed(1)}°C ·{" "}
                    {selected.humidity.toFixed(1)}% humidity ·{" "}
                    {selected.status}
                </div>
            </div>
        </section>
    )
}
/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function TitanApp(props: TitanAppProps) {
    const {
        brandTitle = "TITAN",
        backgroundColor = "#090D14",
        surfaceColor = "#101722",
        accentColor = "#3985FF",
        textColor = "#EDF2FA",
        mutedColor = "#8190A6",
        sidebarColor = "#0C111B",
        borderColor = "#222D3C",
        successColor = "#10B981",
        warningColor = "#F59E0B",
        cyanColor = "#40CDE0",
        font,
        simulationEnabled = true,
        style,
    } = props
    const staticRender = false
    const [nav, setNav] = React.useState<NavKey>("Overview")
    const [search, setSearch] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState("All")
    const [range, setRange] = React.useState<"today" | "7d" | "30d">("today")
    const [uiMode, setUiMode] = React.useState<UIMode>("ready")
    const [mobileNav, setMobileNav] = React.useState(false)
    const [selectedId, setSelectedId] = React.useState("TIT-2026-0842")
    const [detailOpen, setDetailOpen] = React.useState(false)
    const [createOpen, setCreateOpen] = React.useState(false)
    const [alertFilter, setAlertFilter] = React.useState<
        "All" | "Low" | "Medium" | "High"
    >("All")
    const [verifyState, setVerifyState] = React.useState<VerifyState>("pending")
    const [verifyMode, setVerifyMode] = React.useState<"success" | "failure">(
        "success"
    )
    const [verifyStage, setVerifyStage] =
        React.useState<VerifyStage>("initiation")
    const [verifyTime, setVerifyTime] = React.useState("—")
    const [wallet, setWallet] = React.useState("DEMO6fP7xR2m84n3Q")
    const [signature, setSignature] = React.useState("DEMO-PENDING")
    const [verifyHistory, setVerifyHistory] = React.useState<VerifyHistory[]>(
        []
    )
    const [notificationsCfg, setNotificationsCfg] = React.useState({
        email: true,
        sms: false,
        push: true,
    })
    const [sensorInterval, setSensorInterval] = React.useState(30)
    const [network, setNetwork] = React.useState("Devnet")
    const [apiHidden, setApiHidden] = React.useState(true)
    const [apiKey, setApiKey] = React.useState("DEMO-API-8F2A-71B4")
    const [toast, setToast] = React.useState("")
    const [notificationsOpen, setNotificationsOpen] = React.useState(false)
    const [profileOpen, setProfileOpen] = React.useState(false)
    const [tempRange, setTempRange] = React.useState({ min: 2, max: 8 })
    const [humRange, setHumRange] = React.useState({ min: 50, max: 70 })
    const [mapState, setMapState] = React.useState({ zoom: 1, x: 0, y: 0 })
    const detailCloseRef = React.useRef<HTMLButtonElement | null>(null)
    const createCloseRef = React.useRef<HTMLButtonElement | null>(null)

    const [shipments, setShipments] = React.useState<Shipment[]>([
        {
            id: "TIT-2026-0842",
            origin: "Rotterdam",
            destination: "Berlin",
            status: "In transit",
            temperature: 4.8,
            humidity: 62.4,
            lat: 52.3,
            lon: 10.8,
            supplier: "ArcticMed BV",
            nfcId: "NFC-EU-4012",
            signatureState: "Signed",
            lastSeen: "2 min ago",
            cargo: "mRNA vaccines",
            latestIso: "2026-05-04T09:12:00Z",
        },
        {
            id: "TIT-2026-0836",
            origin: "Paris",
            destination: "Milan",
            status: "Attention",
            temperature: 8.7,
            humidity: 69.1,
            lat: 46.0,
            lon: 5.0,
            supplier: "BioTransit FR",
            nfcId: "NFC-EU-3987",
            signatureState: "Pending",
            lastSeen: "6 min ago",
            cargo: "Insulin kits",
            latestIso: "2026-05-04T09:08:00Z",
        },
        {
            id: "TIT-2026-0839",
            origin: "Hamburg",
            destination: "Warsaw",
            status: "In transit",
            temperature: 5.3,
            humidity: 59.2,
            lat: 53.0,
            lon: 15.0,
            supplier: "Nordic Chain",
            nfcId: "NFC-EU-3994",
            signatureState: "Signed",
            lastSeen: "1 min ago",
            cargo: "Biologics",
            latestIso: "2026-05-04T09:13:00Z",
        },
        {
            id: "TIT-2026-0828",
            origin: "Prague",
            destination: "Paris",
            status: "Pending",
            temperature: 4.2,
            humidity: 61.5,
            lat: 49.0,
            lon: 10.5,
            supplier: "Czech Cold Ops",
            nfcId: "NFC-EU-3880",
            signatureState: "Pending",
            lastSeen: "14 min ago",
            cargo: "Blood plasma",
            latestIso: "2026-05-04T08:58:00Z",
        },
        {
            id: "TIT-2026-0822",
            origin: "Berlin",
            destination: "Rotterdam",
            status: "Delivered",
            temperature: 4.9,
            humidity: 57.2,
            lat: 52.5,
            lon: 8.5,
            supplier: "MediFlow DE",
            nfcId: "NFC-EU-3811",
            signatureState: "Signed",
            lastSeen: "Delivered",
            cargo: "Lab reagents",
            latestIso: "2026-05-04T07:42:00Z",
        },
        {
            id: "TIT-2026-0817",
            origin: "Milan",
            destination: "Paris",
            status: "Delivered",
            temperature: 5.1,
            humidity: 60.0,
            lat: 46.0,
            lon: 7.0,
            supplier: "Italia Medx",
            nfcId: "NFC-EU-3750",
            signatureState: "Signed",
            lastSeen: "Delivered",
            cargo: "Diagnostics",
            latestIso: "2026-05-04T06:32:00Z",
        },
        {
            id: "TIT-2026-0811",
            origin: "Warsaw",
            destination: "Hamburg",
            status: "In transit",
            temperature: 3.9,
            humidity: 63.8,
            lat: 52.8,
            lon: 14.0,
            supplier: "Baltic Logistics",
            nfcId: "NFC-EU-3670",
            signatureState: "Signed",
            lastSeen: "4 min ago",
            cargo: "Oncology therapeutics",
            latestIso: "2026-05-04T09:10:00Z",
        },
        {
            id: "TIT-2026-0809",
            origin: "Berlin",
            destination: "Prague",
            status: "Attention",
            temperature: 1.7,
            humidity: 72.2,
            lat: 51.0,
            lon: 13.0,
            supplier: "EuroThermal",
            nfcId: "NFC-EU-3621",
            signatureState: "Failed",
            lastSeen: "3 min ago",
            cargo: "Gene therapy samples",
            latestIso: "2026-05-04T09:11:00Z",
        },
    ])
    const [alerts, setAlerts] = React.useState<AlertItem[]>([
        {
            id: "ALT-1",
            shipmentId: "TIT-2026-0842",
            severity: "High",
            message: "Temperature near threshold",
            timestamp: "09:12",
            acknowledged: false,
        },
        {
            id: "ALT-2",
            shipmentId: "TIT-2026-0836",
            severity: "Medium",
            message: "Humidity fluctuation detected",
            timestamp: "08:47",
            acknowledged: false,
        },
        {
            id: "ALT-3",
            shipmentId: "TIT-2026-0839",
            severity: "Low",
            message: "Checkpoint delay: Prague",
            timestamp: "07:30",
            acknowledged: true,
        },
        {
            id: "ALT-4",
            shipmentId: "TIT-2026-0811",
            severity: "High",
            message: "Missing sensor readings for 12 minutes",
            timestamp: "09:42",
            acknowledged: false,
        },
    ])
    const [readings, setReadings] = React.useState<ReadingPoint[]>([
        { t: "08:00", temp: 4.5, humidity: 61.2 },
        { t: "09:00", temp: 4.8, humidity: 62.4 },
        { t: "10:00", temp: 5.2, humidity: 63.1 },
        { t: "11:00", temp: 6.4, humidity: 67.8 },
        { t: "12:00", temp: 5.9, humidity: 65.6 },
        { t: "13:00", temp: 4.7, humidity: 61.9 },
    ])
    const [createForm, setCreateForm] = React.useState({
        origin: "Rotterdam",
        destination: "Berlin",
        cargo: "Vaccines",
        sensor: "NFC-EU-5001",
        minT: "2",
        maxT: "8",
    })
    const [createError, setCreateError] = React.useState("")

    const selected = React.useMemo(
        () => shipments.find((s) => s.id === selectedId) || shipments[0],
        [shipments, selectedId]
    )
    React.useEffect(() => {
        React.startTransition(() => {
            setVerifyState("pending")
            setVerifyTime("—")
            setSignature("DEMO-PENDING")
        })
    }, [selectedId])

    const filtered = React.useMemo(
        () =>
            shipments.filter(
                (s) =>
                    (statusFilter === "All" || s.status === statusFilter) &&
                    `${s.id} ${s.origin} ${s.destination} ${s.supplier}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
            ),
        [shipments, statusFilter, search]
    )
    const rangeLabel = React.useMemo(
        () =>
            range === "today"
                ? "Today"
                : range === "7d"
                  ? "Last 7 days"
                  : "Last 30 days",
        [range]
    )

    React.useEffect(() => {
        if (!toast) return
        if (typeof window === "undefined") return
        const t = window.setTimeout(
            () => React.startTransition(() => setToast("")),
            1800
        )
        return () => window.clearTimeout(t)
    }, [toast])

    React.useEffect(() => {
        if (staticRender || !simulationEnabled || uiMode === "disconnected")
            return
        if (typeof window === "undefined") return
        const id = window.setInterval(() => {
            React.startTransition(() => {
                setShipments((prev) =>
                    prev.map((s, i) => ({
                        ...s,
                        temperature: Number(
                            (
                                s.temperature +
                                Math.sin(Date.now() / 5000 + i) * 0.08
                            ).toFixed(1)
                        ),
                        humidity: Number(
                            (
                                s.humidity +
                                Math.cos(Date.now() / 6000 + i) * 0.14
                            ).toFixed(1)
                        ),
                        lat:
                            s.status === "In transit"
                                ? Number(
                                      (
                                          s.lat +
                                          0.01 * Math.sin(Date.now() / 4300 + i)
                                      ).toFixed(4)
                                  )
                                : s.lat,
                        lon:
                            s.status === "In transit"
                                ? Number(
                                      (
                                          s.lon +
                                          0.01 * Math.cos(Date.now() / 4700 + i)
                                      ).toFixed(4)
                                  )
                                : s.lon,
                        lastSeen:
                            s.status === "Delivered" ? "Delivered" : "just now",
                        latestIso: new Date().toISOString(),
                    }))
                )
                setReadings((prev) => [
                    ...prev.slice(-5),
                    {
                        t: `${(prev.length + 8).toString().padStart(2, "0")}:00`,
                        temp: selected.temperature,
                        humidity: selected.humidity,
                    },
                ])
            })
        }, 2300)
        return () => window.clearInterval(id)
    }, [
        staticRender,
        simulationEnabled,
        uiMode,
        selected.temperature,
        selected.humidity,
    ])

    const addHistory = React.useCallback(
        (action: string, status: VerifyState, note: string) => {
            const ts = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            })
            React.startTransition(() =>
                setVerifyHistory((prev) =>
                    [
                        {
                            id: `${action}-${ts}`,
                            action,
                            status,
                            timestamp: ts,
                            note,
                        },
                        ...prev,
                    ].slice(0, 8)
                )
            )
            React.startTransition(() => setVerifyTime(ts))
        },
        []
    )

    const scanNfc = React.useCallback(() => {
        React.startTransition(() => setVerifyState("busy"))
        addHistory("Scan NFC", "busy", "Scanner initializing")
        if (typeof window === "undefined") return
        window.setTimeout(
            () =>
                React.startTransition(() => {
                    const ok = verifyMode === "success"
                    setVerifyState(ok ? "pending" : "failed")
                    setSignature(ok ? "DEMO-SCAN-OK" : "DEMO-SCAN-FAILED")
                    addHistory(
                        "Scan NFC",
                        ok ? "pending" : "failed",
                        ok ? "NFC tag captured." : "NFC read timeout."
                    )
                }),
            700
        )
    }, [addHistory, verifyMode])

    const signShipment = React.useCallback(() => {
        React.startTransition(() => setVerifyState("busy"))
        addHistory("Sign Shipment", "busy", "Applying supplier signature")
        if (typeof window === "undefined") return
        window.setTimeout(
            () =>
                React.startTransition(() => {
                    const ok = verifyMode === "success"
                    setVerifyState(ok ? "signed" : "failed")
                    setSignature(
                        ok ? `DEMO-SIG-${selected.id}` : "DEMO-SIG-FAILED"
                    )
                    addHistory(
                        `Sign ${verifyStage === "initiation" ? "Initiation" : "Completion"}`,
                        ok ? "signed" : "failed",
                        ok ? "Shipment signed." : "Signature mismatch."
                    )
                }),
            900
        )
    }, [addHistory, selected.id, verifyMode, verifyStage])

    const verifySignature = React.useCallback(() => {
        React.startTransition(() => setVerifyState("busy"))
        addHistory(
            "Verify Signature",
            "busy",
            "Verifying against demo devnet state"
        )
        if (typeof window === "undefined") return
        window.setTimeout(
            () =>
                React.startTransition(() => {
                    const ok =
                        verifyMode === "success" &&
                        signature.startsWith("DEMO-SIG-")
                    setVerifyState(ok ? "verified" : "failed")
                    addHistory(
                        "Verify Signature",
                        ok ? "verified" : "failed",
                        ok ? "Verification completed." : "Verification failed."
                    )
                }),
            850
        )
    }, [addHistory, signature, verifyMode])

    const createShipment = React.useCallback(() => {
        if (
            !createForm.origin ||
            !createForm.destination ||
            !createForm.cargo ||
            !createForm.sensor
        ) {
            React.startTransition(() =>
                setCreateError("Please fill all required fields.")
            )
            return
        }
        const min = Number(createForm.minT)
        const max = Number(createForm.maxT)
        if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
            React.startTransition(() =>
                setCreateError(
                    "Temperature thresholds must be valid with min < max."
                )
            )
            return
        }
        const next: Shipment = {
            id: `TIT-2026-${Math.floor(1000 + Math.random() * 8999)}`,
            origin: createForm.origin,
            destination: createForm.destination,
            status: "Pending",
            temperature: (min + max) / 2,
            humidity: 60,
            lat: 50,
            lon: 10,
            supplier: "New Supplier",
            nfcId: createForm.sensor,
            signatureState: "Pending",
            lastSeen: "Created",
            cargo: createForm.cargo,
            latestIso: new Date().toISOString(),
        }
        React.startTransition(() => {
            setShipments((prev) => [next, ...prev])
            setSelectedId(next.id)
            setCreateOpen(false)
            setCreateError("")
        })
    }, [createForm])

    const buttonStyle: React.CSSProperties = {
        border: `1px solid ${borderColor}`,
        background: "#0F1623",
        color: textColor,
        borderRadius: 10,
        minHeight: 34,
        padding: "10px 12px",
        width: "auto",
        cursor: "pointer",
        boxSizing: "border-box",
    }
    const inputStyle: React.CSSProperties = {
        width: "100%",
        background: "#0C121D",
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: "9px 10px",
        boxSizing: "border-box",
    }

    const navItems: NavKey[] = [
        "Overview",
        "Shipments",
        "Live Tracking",
        "Sensor Analytics",
        "Blockchain Verification",
        "Alerts",
        "Settings",
    ]
    const navIcon = (item: NavKey) =>
        item === "Overview"
            ? "Overview"
            : item === "Shipments"
              ? "Shipments"
              : item === "Live Tracking"
                ? "Tracking"
                : item === "Sensor Analytics"
                  ? "Analytics"
                  : item === "Blockchain Verification"
                    ? "Chain"
                    : item === "Alerts"
                      ? "Alerts"
                      : "Settings"

    return (
        <div
            className="titan-root-container"
            style={{
                position: "relative",
                width: "100%",
                minHeight: 1100,
                background: backgroundColor,
                color: textColor,
                overflow: "hidden",
                fontFamily: font?.fontFamily || "Inter, system-ui, sans-serif",
                boxSizing: "border-box",
                ...style,
            }}
        >
            <style>{`
                .titan-root,.titan-root *{box-sizing:border-box}
                .titan-root-container{container-type:inline-size}
                .titan-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px}
                .titan-grid > *{min-width:0;max-width:100%}
                .titan-main{padding:24px;display:flex;flex-direction:column;gap:24px;min-width:0;flex:1;width:0}
                .titan-main > *{min-width:0;max-width:100%}
                .titan-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
                .titan-shell{display:flex;min-height:1100px}
                .titan-sidebar{width:224px;flex-shrink:0;background:${sidebarColor};border-right:1px solid ${borderColor};padding:16px;display:flex !important;flex-direction:column;gap:10px}
                .titan-focus:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid ${accentColor};outline-offset:2px}
                @container (max-width: 1200px){.titan-sidebar{width:74px !important}.titan-nav-label,.titan-brand-copy,.titan-brand-sub,.titan-demo-badge,.titan-demo-note{display:none}}
                @container (max-width: 980px){.titan-grid{grid-template-columns:minmax(0,1fr)}.titan-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}
                @container (max-width: 760px){.titan-shell{display:block !important}.titan-sidebar{display:none !important}.titan-main{padding:16px;width:100% !important}.titan-kpi{grid-template-columns:minmax(0,1fr)}.map-tooltip{left:12px !important;max-width:calc(100% - 24px)}.map-svg{height:300px !important}.map-header{flex-wrap:wrap;gap:8px}}
                @media (max-width:1200px){.titan-sidebar{width:74px !important}.titan-nav-label,.titan-brand-copy,.titan-brand-sub,.titan-demo-badge,.titan-demo-note{display:none}}
                @media (max-width:960px){.titan-grid{grid-template-columns:minmax(0,1fr)}.titan-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}
                @media (max-width:760px){.titan-shell{display:block !important}.titan-sidebar{display:none !important}.titan-main{padding:16px;width:100% !important}.titan-kpi{grid-template-columns:minmax(0,1fr)}.map-tooltip{left:12px !important;max-width:calc(100% - 24px)}.map-svg{height:300px !important}.map-header{flex-wrap:wrap;gap:8px}}
            `}</style>
            <div className="titan-root titan-shell">
                <aside className="titan-sidebar">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <Icon name="Shield" color={accentColor} />
                        <div
                            className="titan-brand-copy"
                            style={{ fontWeight: 700 }}
                        >
                            {brandTitle}
                        </div>
                    </div>
                    <div
                        className="titan-brand-sub"
                        style={{ color: mutedColor, fontSize: 12 }}
                    >
                        Secure Transport Intelligence
                    </div>
                    <div
                        className="titan-demo-badge"
                        style={{
                            border: `1px solid ${softColor(cyanColor, 45)}`,
                            color: cyanColor,
                            borderRadius: 999,
                            padding: "4px 8px",
                            fontSize: 11,
                            display: "inline-block",
                        }}
                    >
                        DEMO WORKSPACE
                    </div>
                    {navItems.map((item) => (
                        <button
                            key={item}
                            aria-label={`Navigate to ${item}`}
                            className="titan-focus"
                            onClick={() =>
                                React.startTransition(() => setNav(item))
                            }
                            style={{
                                border: `1px solid ${borderColor}`,
                                background:
                                    nav === item ? "#152137" : "#0F1623",
                                color: textColor,
                                borderRadius: 10,
                                height: 40,
                                width: "100%",
                                padding: "0 10px",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer",
                            }}
                        >
                            <Icon
                                name={navIcon(item)}
                                color={nav === item ? accentColor : mutedColor}
                            />
                            <span
                                className="titan-nav-label"
                                style={{ fontSize: 13 }}
                            >
                                {item}
                            </span>
                        </button>
                    ))}
                    <div
                        className="titan-demo-note"
                        style={{
                            marginTop: "auto",
                            fontSize: 12,
                            color: mutedColor,
                        }}
                    >
                        Simulated data. No live integrations.
                    </div>
                </aside>
                <main className="titan-main">
                    <section
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 12,
                            background: surfaceColor,
                            padding: 16,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                style={buttonStyle}
                                onClick={() =>
                                    React.startTransition(() =>
                                        setMobileNav(true)
                                    )
                                }
                            >
                                <Icon name="Menu" />
                            </button>
                            <div style={{ fontSize: 12, color: mutedColor }}>
                                Operations / {nav}
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    minWidth: 180,
                                    position: "relative",
                                }}
                            >
                                <input
                                    aria-label="Global search shipments"
                                    placeholder="Search shipment, supplier, city…"
                                    value={search}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setSearch(e.target.value)
                                        )
                                    }
                                    style={{ ...inputStyle, paddingLeft: 34 }}
                                />
                                <div
                                    style={{
                                        position: "absolute",
                                        left: 10,
                                        top: 9,
                                    }}
                                >
                                    <Icon name="Search" color={mutedColor} />
                                </div>
                            </div>
                            <StatusBadge
                                label={
                                    uiMode === "disconnected"
                                        ? "Disconnected"
                                        : "Demo connected"
                                }
                                muted={mutedColor}
                                success={successColor}
                                warning={warningColor}
                                cyan={cyanColor}
                            />
                            <button
                                style={buttonStyle}
                                onClick={() =>
                                    React.startTransition(() =>
                                        setNotificationsOpen((v) => !v)
                                    )
                                }
                            >
                                <Icon name="Bell" />
                            </button>
                            <button
                                style={buttonStyle}
                                onClick={() =>
                                    React.startTransition(() =>
                                        setProfileOpen((v) => !v)
                                    )
                                }
                            >
                                AB
                            </button>
                            <select
                                style={{ ...inputStyle, width: 150 }}
                                value={range}
                                onChange={(e) =>
                                    React.startTransition(() =>
                                        setRange(
                                            e.target.value as
                                                | "today"
                                                | "7d"
                                                | "30d"
                                        )
                                    )
                                }
                            >
                                <option value="today">Today</option>
                                <option value="7d">7 days</option>
                                <option value="30d">30 days</option>
                            </select>
                        </div>
                        {notificationsOpen && (
                            <div
                                style={{
                                    marginTop: 10,
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 10,
                                    padding: 10,
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600 }}>
                                    Notifications
                                </div>
                                {alerts.slice(0, 3).map((a) => (
                                    <div
                                        key={a.id}
                                        style={{
                                            fontSize: 12,
                                            color: mutedColor,
                                            marginTop: 4,
                                        }}
                                    >
                                        {a.shipmentId} · {a.message}
                                    </div>
                                ))}
                            </div>
                        )}
                        {profileOpen && (
                            <div
                                style={{
                                    marginTop: 10,
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 10,
                                    padding: 10,
                                }}
                            >
                                <button
                                    style={{
                                        ...buttonStyle,
                                        width: "100%",
                                        justifyContent: "flex-start",
                                    }}
                                    onClick={() => {
                                        React.startTransition(() =>
                                            setNav("Settings")
                                        )
                                        React.startTransition(() =>
                                            setProfileOpen(false)
                                        )
                                    }}
                                >
                                    Open Settings
                                </button>
                            </div>
                        )}
                        {uiMode !== "ready" && (
                            <div
                                style={{
                                    marginTop: 10,
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 10,
                                    padding: 10,
                                    fontSize: 13,
                                }}
                            >
                                {uiMode === "loading"
                                    ? "Loading simulated workspace…"
                                    : uiMode === "empty"
                                      ? "No records for selected filters."
                                      : uiMode === "error"
                                        ? "Simulation error state enabled."
                                        : "Disconnected: updates paused."}
                                <div>
                                    <button
                                        style={{ ...buttonStyle, marginTop: 8 }}
                                        onClick={() =>
                                            React.startTransition(() =>
                                                setUiMode("ready")
                                            )
                                        }
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {nav === "Overview" && (
                        <>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 12,
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            color: mutedColor,
                                            fontSize: 12,
                                            letterSpacing: 1.2,
                                        }}
                                    >
                                        CONTROL CENTER
                                    </div>
                                    <h1
                                        style={{
                                            margin: "4px 0",
                                            fontSize: 26,
                                        }}
                                    >
                                        Operations overview
                                    </h1>
                                    <div
                                        style={{
                                            color: mutedColor,
                                            fontSize: 12,
                                        }}
                                    >
                                        Live cold-chain readiness across Europe
                                        · {rangeLabel}
                                    </div>
                                </div>
                                <button
                                    style={{
                                        ...buttonStyle,
                                        background: accentColor,
                                    }}
                                    onClick={() =>
                                        React.startTransition(() =>
                                            setCreateOpen(true)
                                        )
                                    }
                                >
                                    <Icon name="Plus" /> Create shipment
                                </button>
                            </div>
                            <div className="titan-kpi">
                                {[
                                    ["Active shipments", "24", "+12.8%"],
                                    ["Completed deliveries", "148", "+8.2%"],
                                    [
                                        "Sensor alerts",
                                        "3",
                                        "Requires attention",
                                    ],
                                    [
                                        "Verified shipments",
                                        "98.6%",
                                        "Integrity strong",
                                    ],
                                ].map(([l, v, m], i) => (
                                    <section
                                        key={l}
                                        style={{
                                            border: `1px solid ${borderColor}`,
                                            borderRadius: 12,
                                            background: surfaceColor,
                                            padding: 14,
                                            minHeight: 148,
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: mutedColor,
                                            }}
                                        >
                                            {l}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 30,
                                                fontWeight: 650,
                                            }}
                                        >
                                            {v}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                color: mutedColor,
                                            }}
                                        >
                                            {m}
                                        </div>
                                        <svg
                                            width="100%"
                                            height="36"
                                            viewBox="0 0 100 36"
                                        >
                                            <path
                                                d="M0 26 L14 18 L28 21 L42 15 L56 19 L70 13 L84 16 L100 10"
                                                stroke={
                                                    i % 2
                                                        ? cyanColor
                                                        : accentColor
                                                }
                                                fill="none"
                                                strokeWidth="2"
                                            />
                                        </svg>
                                    </section>
                                ))}
                            </div>
                            <div className="titan-grid">
                                <MapCard
                                    selected={selected}
                                    shipments={shipments}
                                    selectedId={selectedId}
                                    setSelectedId={(id) => setSelectedId(id)}
                                    mapState={mapState}
                                    setMapState={(u) =>
                                        setMapState((p) => u(p))
                                    }
                                    borderColor={borderColor}
                                    surfaceColor={surfaceColor}
                                    mutedColor={mutedColor}
                                    textColor={textColor}
                                    accentColor={accentColor}
                                    cyanColor={cyanColor}
                                    buttonStyle={buttonStyle}
                                />
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 24,
                                    }}
                                >
                                    <ChartCard
                                        title="Temperature"
                                        unit="°C"
                                        value={selected.temperature}
                                        seed={
                                            range === "today"
                                                ? 1.2
                                                : range === "7d"
                                                  ? 2.1
                                                  : 3.1
                                        }
                                        color={accentColor}
                                        muted={mutedColor}
                                        border={borderColor}
                                        range={rangeLabel}
                                        threshold={tempRange.max}
                                        min={0}
                                        max={10}
                                    />
                                    <ChartCard
                                        title="Humidity"
                                        unit="%"
                                        value={selected.humidity}
                                        seed={
                                            range === "today"
                                                ? 0.6
                                                : range === "7d"
                                                  ? 1.6
                                                  : 2.6
                                        }
                                        color={cyanColor}
                                        muted={mutedColor}
                                        border={borderColor}
                                        range={rangeLabel}
                                        threshold={humRange.max}
                                        min={40}
                                        max={80}
                                    />
                                </div>
                            </div>
                            <div className="titan-grid">
                                <section
                                    style={{
                                        border: `1px solid ${borderColor}`,
                                        borderRadius: 12,
                                        background: surfaceColor,
                                        padding: 16,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Recent shipments
                                        </div>
                                        <button
                                            style={buttonStyle}
                                            onClick={() =>
                                                React.startTransition(() =>
                                                    setNav("Shipments")
                                                )
                                            }
                                        >
                                            View all
                                        </button>
                                    </div>
                                    <ShipmentTable
                                        compact
                                        rows={filtered.slice(0, 5)}
                                        search={search}
                                        statusFilter={statusFilter}
                                        setSearch={setSearch}
                                        setStatusFilter={setStatusFilter}
                                        borderColor={borderColor}
                                        mutedColor={mutedColor}
                                        successColor={successColor}
                                        warningColor={warningColor}
                                        cyanColor={cyanColor}
                                        accentColor={accentColor}
                                        buttonStyle={buttonStyle}
                                        inputStyle={inputStyle}
                                        onCreate={() => setCreateOpen(true)}
                                        onDetail={(id) => {
                                            React.startTransition(() =>
                                                setSelectedId(id)
                                            )
                                            React.startTransition(() =>
                                                setDetailOpen(true)
                                            )
                                        }}
                                    />
                                </section>
                                <section
                                    style={{
                                        border: `1px solid ${borderColor}`,
                                        borderRadius: 12,
                                        background: surfaceColor,
                                        padding: 16,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 600,
                                        }}
                                    >
                                        Critical alerts
                                    </div>
                                    {alerts
                                        .filter((a) => a.severity !== "Low")
                                        .map((a) => (
                                            <div
                                                key={a.id}
                                                style={{
                                                    borderTop: `1px solid ${borderColor}`,
                                                    paddingTop: 8,
                                                    marginTop: 8,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                    }}
                                                >
                                                    <StatusBadge
                                                        label={a.severity}
                                                        muted={mutedColor}
                                                        success={successColor}
                                                        warning={warningColor}
                                                        cyan={cyanColor}
                                                    />
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            color: mutedColor,
                                                        }}
                                                    >
                                                        {a.timestamp}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 13 }}>
                                                    {a.message}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: mutedColor,
                                                    }}
                                                >
                                                    {a.shipmentId}
                                                </div>
                                            </div>
                                        ))}
                                </section>
                            </div>
                            <section
                                style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12,
                                    background: surfaceColor,
                                    padding: 16,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 12,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                    }}
                                >
                                    <StatusBadge
                                        label="Devnet"
                                        muted={mutedColor}
                                        success={successColor}
                                        warning={warningColor}
                                        cyan={cyanColor}
                                    />
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: mutedColor,
                                        }}
                                    >
                                        Simulated network · Slot 302,194,010 ·
                                        Confirmation 0.41s
                                    </span>
                                    <a
                                        style={{ color: accentColor }}
                                        href="https://explorer.solana.com/?cluster=devnet"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Explorer
                                    </a>
                                    <button
                                        style={buttonStyle}
                                        onClick={() =>
                                            React.startTransition(() =>
                                                setNav(
                                                    "Blockchain Verification"
                                                )
                                            )
                                        }
                                    >
                                        Verify checkpoint
                                    </button>
                                </div>
                            </section>
                            <section
                                style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12,
                                    background: surfaceColor,
                                    padding: 16,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    Recent activity
                                </div>
                                {verifyHistory.slice(0, 4).map((h) => (
                                    <div
                                        key={h.id}
                                        style={{
                                            borderTop: `1px solid ${borderColor}`,
                                            paddingTop: 8,
                                            marginTop: 8,
                                            fontSize: 13,
                                        }}
                                    >
                                        {h.timestamp} · {h.action} · {h.status}
                                    </div>
                                ))}
                                {verifyHistory.length === 0 && (
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: mutedColor,
                                        }}
                                    >
                                        No verification activity yet.
                                    </div>
                                )}
                            </section>
                        </>
                    )}

                    {nav === "Shipments" && (
                        <section
                            style={{
                                border: `1px solid ${borderColor}`,
                                borderRadius: 12,
                                background: surfaceColor,
                                padding: 16,
                            }}
                        >
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                Shipment registry
                            </div>
                            <ShipmentTable
                                rows={filtered}
                                search={search}
                                statusFilter={statusFilter}
                                setSearch={setSearch}
                                setStatusFilter={setStatusFilter}
                                borderColor={borderColor}
                                mutedColor={mutedColor}
                                successColor={successColor}
                                warningColor={warningColor}
                                cyanColor={cyanColor}
                                accentColor={accentColor}
                                buttonStyle={buttonStyle}
                                inputStyle={inputStyle}
                                onCreate={() => setCreateOpen(true)}
                                onDetail={(id) => {
                                    React.startTransition(() =>
                                        setSelectedId(id)
                                    )
                                    React.startTransition(() =>
                                        setDetailOpen(true)
                                    )
                                }}
                            />
                        </section>
                    )}
                    {nav === "Live Tracking" && (
                        <div className="titan-grid">
                            <MapCard
                                large
                                selected={selected}
                                shipments={shipments}
                                selectedId={selectedId}
                                setSelectedId={(id) => setSelectedId(id)}
                                mapState={mapState}
                                setMapState={(u) => setMapState((p) => u(p))}
                                borderColor={borderColor}
                                surfaceColor={surfaceColor}
                                mutedColor={mutedColor}
                                textColor={textColor}
                                accentColor={accentColor}
                                cyanColor={cyanColor}
                                buttonStyle={buttonStyle}
                            />
                            <section
                                style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12,
                                    background: surfaceColor,
                                    padding: 16,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    Selected shipment
                                </div>
                                <div>{selected.id}</div>
                                <div
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    {selected.lat.toFixed(4)},{" "}
                                    {selected.lon.toFixed(4)}
                                </div>
                                <div
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Latest reading: {selected.latestIso}
                                </div>
                                <div
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Temp {selected.temperature.toFixed(1)}°C ·
                                    Humidity {selected.humidity.toFixed(1)}% ·
                                    Status {selected.status}
                                </div>
                                <div
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Timestamp: approx. {selected.lastSeen} ·
                                    Uncertainty ±4.2 km
                                </div>
                            </section>
                        </div>
                    )}
                    {nav === "Sensor Analytics" && (
                        <div className="titan-grid">
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 24,
                                }}
                            >
                                <ChartCard
                                    title="Temperature trends"
                                    unit="°C"
                                    value={selected.temperature}
                                    seed={2.4}
                                    color={accentColor}
                                    muted={mutedColor}
                                    border={borderColor}
                                    range={rangeLabel}
                                    threshold={tempRange.max}
                                    min={0}
                                    max={10}
                                />
                                <ChartCard
                                    title="Humidity trends"
                                    unit="%"
                                    value={selected.humidity}
                                    seed={1.3}
                                    color={cyanColor}
                                    muted={mutedColor}
                                    border={borderColor}
                                    range={rangeLabel}
                                    threshold={humRange.max}
                                    min={40}
                                    max={80}
                                />
                            </div>
                            <section
                                style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12,
                                    background: surfaceColor,
                                    padding: 16,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 600 }}>
                                    Thresholds and violations
                                </div>
                                <label
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Min °C
                                    <input
                                        style={inputStyle}
                                        value={tempRange.min}
                                        onChange={(e) =>
                                            React.startTransition(() =>
                                                setTempRange((r) => ({
                                                    ...r,
                                                    min: Number(e.target.value),
                                                }))
                                            )
                                        }
                                    />
                                </label>
                                <label
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Max °C
                                    <input
                                        style={inputStyle}
                                        value={tempRange.max}
                                        onChange={(e) =>
                                            React.startTransition(() =>
                                                setTempRange((r) => ({
                                                    ...r,
                                                    max: Number(e.target.value),
                                                }))
                                            )
                                        }
                                    />
                                </label>
                                <label
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Min %
                                    <input
                                        style={inputStyle}
                                        value={humRange.min}
                                        onChange={(e) =>
                                            React.startTransition(() =>
                                                setHumRange((r) => ({
                                                    ...r,
                                                    min: Number(e.target.value),
                                                }))
                                            )
                                        }
                                    />
                                </label>
                                <label
                                    style={{ fontSize: 12, color: mutedColor }}
                                >
                                    Max %
                                    <input
                                        style={inputStyle}
                                        value={humRange.max}
                                        onChange={(e) =>
                                            React.startTransition(() =>
                                                setHumRange((r) => ({
                                                    ...r,
                                                    max: Number(e.target.value),
                                                }))
                                            )
                                        }
                                    />
                                </label>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: mutedColor,
                                        margin: "6px 0",
                                    }}
                                >
                                    Connectivity: 99.2% uptime.
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                    <table
                                        style={{
                                            width: "100%",
                                            borderCollapse: "collapse",
                                            fontSize: 12,
                                        }}
                                    >
                                        <thead>
                                            <tr>
                                                <th
                                                    style={{
                                                        textAlign: "left",
                                                        padding: "8px 0",
                                                    }}
                                                >
                                                    Timestamp
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: "left",
                                                        padding: "8px 0",
                                                    }}
                                                >
                                                    Temp
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: "left",
                                                        padding: "8px 0",
                                                    }}
                                                >
                                                    Humidity
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: "left",
                                                        padding: "8px 0",
                                                    }}
                                                >
                                                    Violation
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {readings.map((r) => {
                                                const violation =
                                                    r.temp < tempRange.min ||
                                                    r.temp > tempRange.max ||
                                                    r.humidity < humRange.min ||
                                                    r.humidity > humRange.max
                                                return (
                                                    <tr
                                                        key={r.t}
                                                        style={{
                                                            borderTop: `1px solid ${borderColor}`,
                                                        }}
                                                    >
                                                        <td
                                                            style={{
                                                                padding:
                                                                    "8px 0",
                                                            }}
                                                        >
                                                            {r.t}
                                                        </td>
                                                        <td>
                                                            {r.temp.toFixed(1)}
                                                            °C
                                                        </td>
                                                        <td>
                                                            {r.humidity.toFixed(
                                                                1
                                                            )}
                                                            %
                                                        </td>
                                                        <td>
                                                            {violation
                                                                ? "Yes"
                                                                : "No"}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    )}
                    {nav === "Blockchain Verification" && (
                        <section
                            style={{
                                border: `1px solid ${borderColor}`,
                                borderRadius: 12,
                                background: surfaceColor,
                                padding: 16,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    border: `1px solid ${softColor(warningColor, 45)}`,
                                    color: warningColor,
                                    borderRadius: 999,
                                    fontSize: 11,
                                    padding: "4px 8px",
                                    display: "inline-block",
                                }}
                            >
                                Simulation only — no wallet, NFC or blockchain
                                connection.
                            </div>
                            <select
                                style={inputStyle}
                                value={selectedId}
                                onChange={(e) =>
                                    React.startTransition(() =>
                                        setSelectedId(e.target.value)
                                    )
                                }
                            >
                                {shipments.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.id}
                                    </option>
                                ))}
                            </select>
                            <div style={{ fontSize: 12, color: mutedColor }}>
                                NFC: {selected.nfcId}
                            </div>
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                Wallet
                                <input
                                    style={inputStyle}
                                    value={wallet}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setWallet(e.target.value)
                                        )
                                    }
                                />
                            </label>
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                Signature
                                <input
                                    style={inputStyle}
                                    value={signature}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setSignature(e.target.value)
                                        )
                                    }
                                />
                            </label>
                            <div style={{ fontSize: 12, color: mutedColor }}>
                                Timestamp: {verifyTime}
                            </div>
                            <select
                                style={{ ...inputStyle, width: 260 }}
                                value={verifyMode}
                                onChange={(e) =>
                                    React.startTransition(() =>
                                        setVerifyMode(
                                            e.target.value as
                                                | "success"
                                                | "failure"
                                        )
                                    )
                                }
                            >
                                <option value="success">
                                    Scenario: signed success
                                </option>
                                <option value="failure">
                                    Scenario: failed verification
                                </option>
                            </select>
                            <select
                                style={{ ...inputStyle, width: 260 }}
                                value={verifyStage}
                                onChange={(e) =>
                                    React.startTransition(() =>
                                        setVerifyStage(
                                            e.target.value as VerifyStage
                                        )
                                    )
                                }
                            >
                                <option value="initiation">
                                    Sign event: initiation
                                </option>
                                <option value="completion">
                                    Sign event: completion
                                </option>
                            </select>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                <button style={buttonStyle} onClick={scanNfc}>
                                    Scan NFC
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={signShipment}
                                >
                                    Sign Shipment
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={verifySignature}
                                >
                                    Verify Signature
                                </button>
                            </div>
                            <StatusBadge
                                label={verifyState}
                                muted={mutedColor}
                                success={successColor}
                                warning={warningColor}
                                cyan={cyanColor}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                }}
                            >
                                {[
                                    "Created",
                                    "Initiated supplier signature",
                                    "In transit",
                                    "Completed supplier signature",
                                    "Verified",
                                ].map((step, i) => {
                                    const done =
                                        i <=
                                        (verifyState === "verified"
                                            ? 4
                                            : verifyState === "signed"
                                              ? verifyStage === "completion"
                                                  ? 3
                                                  : 1
                                              : verifyState === "busy"
                                                ? 2
                                                : verifyState === "pending"
                                                  ? 1
                                                  : 0)
                                    return (
                                        <span
                                            key={step}
                                            style={{
                                                border: `1px solid ${done ? softColor(accentColor, 55) : borderColor}`,
                                                color: done
                                                    ? textColor
                                                    : mutedColor,
                                                borderRadius: 999,
                                                fontSize: 11,
                                                padding: "4px 8px",
                                            }}
                                        >
                                            {step}
                                        </span>
                                    )
                                })}
                            </div>
                            <div style={{ fontSize: 12, color: mutedColor }}>
                                Workflow: sensor → HTTPS/TLS + API key → SQL
                                (planned) → threshold alerts → optional
                                checkpoints.
                            </div>
                            <a
                                href="https://explorer.solana.com/?cluster=devnet"
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: accentColor }}
                            >
                                Open Solana Explorer (Devnet)
                            </a>
                            <div style={{ overflowX: "auto" }}>
                                <table
                                    style={{
                                        width: "100%",
                                        borderCollapse: "collapse",
                                        fontSize: 12,
                                    }}
                                >
                                    <thead>
                                        <tr>
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "8px 0",
                                                }}
                                            >
                                                Time
                                            </th>
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "8px 0",
                                                }}
                                            >
                                                Action
                                            </th>
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "8px 0",
                                                }}
                                            >
                                                Status
                                            </th>
                                            <th
                                                style={{
                                                    textAlign: "left",
                                                    padding: "8px 0",
                                                }}
                                            >
                                                Note
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {verifyHistory.map((h) => (
                                            <tr
                                                key={h.id}
                                                style={{
                                                    borderTop: `1px solid ${borderColor}`,
                                                }}
                                            >
                                                <td
                                                    style={{ padding: "8px 0" }}
                                                >
                                                    {h.timestamp}
                                                </td>
                                                <td>{h.action}</td>
                                                <td>{h.status}</td>
                                                <td>{h.note}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                    {nav === "Alerts" && (
                        <section
                            style={{
                                border: `1px solid ${borderColor}`,
                                borderRadius: 12,
                                background: surfaceColor,
                                padding: 16,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    marginBottom: 8,
                                }}
                            >
                                <select
                                    style={{ ...inputStyle, width: 170 }}
                                    value={alertFilter}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setAlertFilter(
                                                e.target.value as
                                                    | "All"
                                                    | "Low"
                                                    | "Medium"
                                                    | "High"
                                            )
                                        )
                                    }
                                >
                                    <option>All</option>
                                    <option>Low</option>
                                    <option>Medium</option>
                                    <option>High</option>
                                </select>
                            </div>
                            {alerts
                                .filter(
                                    (a) =>
                                        alertFilter === "All" ||
                                        a.severity === alertFilter
                                )
                                .map((a) => (
                                    <div
                                        key={a.id}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            borderTop: `1px solid ${borderColor}`,
                                            paddingTop: 8,
                                        }}
                                    >
                                        <div>
                                            <StatusBadge
                                                label={a.severity}
                                                muted={mutedColor}
                                                success={successColor}
                                                warning={warningColor}
                                                cyan={cyanColor}
                                            />
                                            <div>{a.message}</div>
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    color: mutedColor,
                                                }}
                                            >
                                                {a.timestamp} · {a.shipmentId}
                                            </div>
                                        </div>
                                        <div
                                            style={{ display: "flex", gap: 8 }}
                                        >
                                            <button
                                                style={buttonStyle}
                                                onClick={() =>
                                                    React.startTransition(() =>
                                                        setAlerts((prev) =>
                                                            prev.map((x) =>
                                                                x.id === a.id
                                                                    ? {
                                                                          ...x,
                                                                          acknowledged:
                                                                              !x.acknowledged,
                                                                      }
                                                                    : x
                                                            )
                                                        )
                                                    )
                                                }
                                            >
                                                {a.acknowledged
                                                    ? "Undo"
                                                    : "Acknowledge"}
                                            </button>
                                            <button
                                                style={buttonStyle}
                                                onClick={() => {
                                                    React.startTransition(() =>
                                                        setSelectedId(
                                                            a.shipmentId
                                                        )
                                                    )
                                                    React.startTransition(() =>
                                                        setDetailOpen(true)
                                                    )
                                                }}
                                            >
                                                Details
                                            </button>
                                        </div>
                                    </div>
                                ))}
                        </section>
                    )}
                    {nav === "Settings" && (
                        <section
                            style={{
                                border: `1px solid ${borderColor}`,
                                borderRadius: 12,
                                background: surfaceColor,
                                padding: 16,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                UI state
                                <select
                                    style={inputStyle}
                                    value={uiMode}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setUiMode(e.target.value as UIMode)
                                        )
                                    }
                                >
                                    <option value="ready">ready</option>
                                    <option value="loading">loading</option>
                                    <option value="empty">empty</option>
                                    <option value="error">error</option>
                                    <option value="disconnected">
                                        disconnected
                                    </option>
                                </select>
                            </label>
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                API key
                                <input
                                    style={inputStyle}
                                    value={
                                        apiHidden ? "DEMO-API-••••••••" : apiKey
                                    }
                                    readOnly
                                />
                            </label>
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                Sensor interval (ESP8266) seconds
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={sensorInterval}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setSensorInterval(
                                                Number(e.target.value) || 0
                                            )
                                        )
                                    }
                                />
                            </label>
                            <label style={{ fontSize: 12, color: mutedColor }}>
                                Network
                                <select
                                    style={inputStyle}
                                    value={network}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setNetwork(e.target.value)
                                        )
                                    }
                                >
                                    <option>Devnet</option>
                                    <option>Mainnet (preview only)</option>
                                </select>
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={notificationsCfg.email}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setNotificationsCfg((p) => ({
                                                ...p,
                                                email: e.target.checked,
                                            }))
                                        )
                                    }
                                />{" "}
                                Email notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={notificationsCfg.sms}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setNotificationsCfg((p) => ({
                                                ...p,
                                                sms: e.target.checked,
                                            }))
                                        )
                                    }
                                />{" "}
                                SMS notifications
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={notificationsCfg.push}
                                    onChange={(e) =>
                                        React.startTransition(() =>
                                            setNotificationsCfg((p) => ({
                                                ...p,
                                                push: e.target.checked,
                                            }))
                                        )
                                    }
                                />{" "}
                                Push notifications
                            </label>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                }}
                            >
                                <button
                                    style={buttonStyle}
                                    onClick={() =>
                                        React.startTransition(() =>
                                            setApiHidden((v) => !v)
                                        )
                                    }
                                >
                                    {apiHidden ? "Reveal key" : "Mask key"}
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() =>
                                        React.startTransition(() =>
                                            setApiKey(
                                                `DEMO-API-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
                                            )
                                        )
                                    }
                                >
                                    Rotate demo key
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() =>
                                        React.startTransition(() =>
                                            setToast("Settings saved")
                                        )
                                    }
                                >
                                    Save settings
                                </button>
                                <button
                                    style={buttonStyle}
                                    onClick={() =>
                                        React.startTransition(() =>
                                            setUiMode("ready")
                                        )
                                    }
                                >
                                    Retry
                                </button>
                            </div>
                            {toast && (
                                <div
                                    style={{
                                        border: `1px solid ${successColor}66`,
                                        color: successColor,
                                        borderRadius: 999,
                                        display: "inline-block",
                                        fontSize: 11,
                                        padding: "4px 8px",
                                    }}
                                >
                                    {toast}
                                </div>
                            )}
                            <div style={{ fontSize: 12, color: mutedColor }}>
                                Network mode is preview only. No live
                                integration.
                            </div>
                        </section>
                    )}
                </main>
            </div>
            {mobileNav && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: softColor("#000000", 55),
                        zIndex: 70,
                    }}
                    onClick={() =>
                        React.startTransition(() => setMobileNav(false))
                    }
                >
                    <div
                        style={{
                            width: 260,
                            height: "100%",
                            background: sidebarColor,
                            padding: 14,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {navItems.map((item) => (
                            <button
                                key={item}
                                style={{
                                    ...buttonStyle,
                                    width: "100%",
                                    height: 40,
                                    marginBottom: 8,
                                    display: "flex",
                                    gap: 8,
                                    alignItems: "center",
                                }}
                                onClick={() => {
                                    React.startTransition(() => setNav(item))
                                    React.startTransition(() =>
                                        setMobileNav(false)
                                    )
                                }}
                            >
                                <Icon
                                    name={navIcon(item)}
                                    color={accentColor}
                                />
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <AppModal
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                title={`Shipment ${selected.id}`}
                border={borderColor}
                closeRef={detailCloseRef}
            >
                <div style={{ fontSize: 12, color: mutedColor }}>
                    {selected.origin}→{selected.destination} · {selected.cargo}
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginTop: 10,
                    }}
                >
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                        }}
                    >
                        Sensor history: {selected.temperature.toFixed(1)}°C /{" "}
                        {selected.humidity.toFixed(1)}%.
                    </div>
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                        }}
                    >
                        NFC: {selected.nfcId} · Signature:{" "}
                        {selected.signatureState}
                    </div>
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                        }}
                    >
                        Lifecycle: Created → Initiated supplier signature → In
                        transit → Completed supplier signature → Verified
                    </div>
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                        }}
                    >
                        Thresholds
                        <input
                            style={inputStyle}
                            value={tempRange.min}
                            onChange={(e) =>
                                React.startTransition(() =>
                                    setTempRange((r) => ({
                                        ...r,
                                        min: Number(e.target.value),
                                    }))
                                )
                            }
                        />
                    </div>
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                            gridColumn: "1 / -1",
                        }}
                    >
                        <svg viewBox="0 0 420 120" width="100%" height="110">
                            <path
                                d="M30 20h360v80H30z"
                                fill="#0A0F17"
                                stroke={borderColor}
                            />
                            <path
                                d="M50 80 C120 50, 170 50, 220 60 C260 68, 320 46, 360 44"
                                stroke={accentColor}
                                fill="none"
                            />
                            <circle cx="220" cy="60" r="5" fill={accentColor} />
                            <text
                                x="236"
                                y="64"
                                fontSize="10"
                                fill={mutedColor}
                            >
                                {selected.origin}→{selected.destination}
                            </text>
                        </svg>
                        <div
                            style={{
                                fontSize: 12,
                                color: mutedColor,
                                marginTop: 6,
                            }}
                        >
                            Latest reading timestamp: {selected.latestIso}
                        </div>
                    </div>
                    <div
                        style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 10,
                            padding: 10,
                            gridColumn: "1 / -1",
                        }}
                    >
                        <div style={{ fontSize: 12, color: mutedColor }}>
                            Recent readings
                        </div>
                        {readings.slice(-4).map((r) => (
                            <div
                                key={r.t}
                                style={{ fontSize: 12, marginTop: 4 }}
                            >
                                {r.t}: {r.temp.toFixed(1)}°C ·{" "}
                                {r.humidity.toFixed(1)}%
                            </div>
                        ))}
                    </div>
                </div>
            </AppModal>
            <AppModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create shipment"
                border={borderColor}
                closeRef={createCloseRef}
            >
                <label style={{ fontSize: 12, color: mutedColor }}>
                    Origin
                    <input
                        style={inputStyle}
                        value={createForm.origin}
                        onChange={(e) =>
                            React.startTransition(() =>
                                setCreateForm((f) => ({
                                    ...f,
                                    origin: e.target.value,
                                }))
                            )
                        }
                    />
                </label>
                <label style={{ fontSize: 12, color: mutedColor }}>
                    Destination
                    <input
                        style={inputStyle}
                        value={createForm.destination}
                        onChange={(e) =>
                            React.startTransition(() =>
                                setCreateForm((f) => ({
                                    ...f,
                                    destination: e.target.value,
                                }))
                            )
                        }
                    />
                </label>
                <label style={{ fontSize: 12, color: mutedColor }}>
                    Cargo
                    <input
                        style={inputStyle}
                        value={createForm.cargo}
                        onChange={(e) =>
                            React.startTransition(() =>
                                setCreateForm((f) => ({
                                    ...f,
                                    cargo: e.target.value,
                                }))
                            )
                        }
                    />
                </label>
                <label style={{ fontSize: 12, color: mutedColor }}>
                    Sensor/NFC
                    <input
                        style={inputStyle}
                        value={createForm.sensor}
                        onChange={(e) =>
                            React.startTransition(() =>
                                setCreateForm((f) => ({
                                    ...f,
                                    sensor: e.target.value,
                                }))
                            )
                        }
                    />
                </label>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                    }}
                >
                    <label style={{ fontSize: 12, color: mutedColor }}>
                        Min °C
                        <input
                            style={inputStyle}
                            value={createForm.minT}
                            onChange={(e) =>
                                React.startTransition(() =>
                                    setCreateForm((f) => ({
                                        ...f,
                                        minT: e.target.value,
                                    }))
                                )
                            }
                        />
                    </label>
                    <label style={{ fontSize: 12, color: mutedColor }}>
                        Max °C
                        <input
                            style={inputStyle}
                            value={createForm.maxT}
                            onChange={(e) =>
                                React.startTransition(() =>
                                    setCreateForm((f) => ({
                                        ...f,
                                        maxT: e.target.value,
                                    }))
                                )
                            }
                        />
                    </label>
                </div>
                {createError && (
                    <div style={{ color: warningColor }}>{createError}</div>
                )}
                <button
                    style={{
                        ...buttonStyle,
                        width: "100%",
                        background: accentColor,
                    }}
                    onClick={createShipment}
                >
                    Create shipment
                </button>
            </AppModal>
        </div>
    )
}
