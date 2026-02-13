import React, { useEffect, useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BarChart3, FileText, HardDrive, Share2, ShieldCheck, Lock,
  TrendingUp, Clock, AlertTriangle, Folder, Activity, Eye,
  ArrowUpRight, ArrowDownRight, PieChart as PieIcon, CalendarDays
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend
} from 'recharts';
import { makeAuthorizedFetch } from '../utils/api';
import { formatBytes } from '../utils/formatters';

const CHART_COLORS = ['#6366f1', '#f472b6', '#fb923c', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#94a3b8'];

const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <p className="analytics-tooltip__label">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="analytics-tooltip__value" style={{ color: entry.color }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color, trend, trendValue }) => (
  <div className="analytics-stat-card">
    <div className="analytics-stat-card__icon" style={{ background: `${color}22`, color }}>
      <Icon size={22} />
    </div>
    <div className="analytics-stat-card__body">
      <span className="analytics-stat-card__label">{label}</span>
      <div className="analytics-stat-card__row">
        <span className="analytics-stat-card__value">{value}</span>
        {trend && (
          <span className={`analytics-stat-card__trend analytics-stat-card__trend--${trend}`}>
            {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trendValue}
          </span>
        )}
      </div>
      {sub && <span className="analytics-stat-card__sub">{sub}</span>}
    </div>
  </div>
);

const SecurityMeter = ({ label, value, total, color }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="analytics-security-meter">
      <div className="analytics-security-meter__header">
        <span>{label}</span>
        <span style={{ color }}>{value} files</span>
      </div>
      <div className="analytics-security-meter__bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="analytics-security-meter__pct">{pct}%</span>
    </div>
  );
};

export default function Analytics() {
  const { idToken } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!idToken) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const fetcher = makeAuthorizedFetch(idToken);
        const res = await fetcher('/analytics');
        if (!res.ok) throw new Error('Failed to load analytics');
        const json = await res.json();
        if (alive) setData(json);
      } catch (err) {
        if (alive) setError(err.message || 'Something went wrong');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [idToken]);

  // Format timeline data for display
  const timelineData = useMemo(() => {
    if (!data?.upload_timeline) return [];
    return data.upload_timeline.map(d => ({
      ...d,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [data]);

  // Compute weekly uploads for trend
  const weeklyTrend = useMemo(() => {
    if (!timelineData.length) return { trend: null, value: '' };
    const last7 = timelineData.slice(-7).reduce((s, d) => s + d.count, 0);
    const prev7 = timelineData.slice(-14, -7).reduce((s, d) => s + d.count, 0);
    if (prev7 === 0 && last7 === 0) return { trend: null, value: '' };
    if (prev7 === 0) return { trend: 'up', value: `+${last7}` };
    const change = Math.round(((last7 - prev7) / prev7) * 100);
    return {
      trend: change >= 0 ? 'up' : 'down',
      value: `${change >= 0 ? '+' : ''}${change}%`,
    };
  }, [timelineData]);

  if (loading) {
    return (
      <main className="main-content">
        <header className="main-header">
          <div>
            <h1>Analytics</h1>
            <p>Loading your insights...</p>
          </div>
        </header>
        <div className="analytics-loading">
          <div className="analytics-loading__spinner" />
          <p>Crunching your data...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main-content">
        <header className="main-header">
          <div>
            <h1>Analytics</h1>
            <p>Overview of your encrypted workspace</p>
          </div>
        </header>
        <div className="analytics-error">
          <AlertTriangle size={24} />
          <p>{error}</p>
          <button className="primary-btn" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </main>
    );
  }

  const summary = data?.summary || {};
  const fileTypes = data?.file_types || [];
  const storageByTag = data?.storage_by_tag || [];
  const expiringSoon = data?.expiring_soon || [];
  const recentActivity = data?.recent_activity || [];
  const security = data?.security_overview || {};

  return (
    <main className="main-content analytics-page">
      <header className="main-header">
        <div>
          <h1>Analytics</h1>
          <p>Overview of your encrypted workspace</p>
        </div>
        <div className="analytics-period">
          <CalendarDays size={16} />
          <span>Last 30 days</span>
        </div>
      </header>

      {/* ═══ STAT CARDS ═══ */}
      <section className="analytics-stats-grid">
        <StatCard
          icon={FileText}
          label="Total Files"
          value={summary.total_files ?? 0}
          sub="All encrypted files"
          color="#6366f1"
          trend={weeklyTrend.trend}
          trendValue={weeklyTrend.value}
        />
        <StatCard
          icon={HardDrive}
          label="Storage Used"
          value={formatBytes(summary.total_size ?? 0)}
          sub={`${summary.total_size_mb ?? 0} MB used`}
          color="#38bdf8"
        />
        <StatCard
          icon={Share2}
          label="Shared Files"
          value={summary.shared_count ?? 0}
          sub={`${summary.shared_with_me_count ?? 0} shared with you`}
          color="#f472b6"
        />
        <StatCard
          icon={ShieldCheck}
          label="Encryption Rate"
          value={`${summary.encryption_rate ?? 0}%`}
          sub={`${summary.advance_security_count ?? 0} with advanced security`}
          color="#34d399"
        />
      </section>

      {/* ═══ CHARTS ROW 1 ═══ */}
      <section className="analytics-charts-grid">
        {/* Upload Activity */}
        <div className="analytics-chart-card analytics-chart-card--wide">
          <div className="analytics-chart-card__header">
            <div>
              <h3><TrendingUp size={18} /> Upload Activity</h3>
              <span className="muted">File uploads over the last 30 days</span>
            </div>
          </div>
          <div className="analytics-chart-card__body">
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    interval={Math.ceil(timelineData.length / 8)}
                  />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Uploads"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#uploadGrad)"
                    dot={false}
                    activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2, fill: '#0f1729' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="analytics-empty">No upload data yet</div>
            )}
          </div>
        </div>

        {/* File Type Distribution */}
        <div className="analytics-chart-card">
          <div className="analytics-chart-card__header">
            <div>
              <h3><PieIcon size={18} /> File Types</h3>
              <span className="muted">Distribution by category</span>
            </div>
          </div>
          <div className="analytics-chart-card__body analytics-chart-card__body--centered">
            {fileTypes.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={fileTypes}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="name"
                      stroke="none"
                    >
                      {fileTypes.map((entry, i) => (
                        <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="analytics-pie-legend">
                  {fileTypes.map((t, i) => (
                    <div key={i} className="analytics-pie-legend__item">
                      <span className="analytics-pie-legend__dot" style={{ background: t.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="analytics-pie-legend__name">{t.name}</span>
                      <span className="analytics-pie-legend__count">{t.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="analytics-empty">No files uploaded yet</div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ CHARTS ROW 2 ═══ */}
      <section className="analytics-charts-grid">
        {/* Storage by Tag */}
        <div className="analytics-chart-card">
          <div className="analytics-chart-card__header">
            <div>
              <h3><Folder size={18} /> Storage by Folder</h3>
              <span className="muted">Space usage per tag/folder</span>
            </div>
          </div>
          <div className="analytics-chart-card__body">
            {storageByTag.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={storageByTag} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    tickFormatter={(v) => `${v} MB`}
                  />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tick={{ fill: '#e5e7eb', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={150}
                  />
                  <Tooltip
                    content={<CustomTooltip formatter={(v) => `${v} MB`} />}
                  />
                  <Bar
                    dataKey="size_mb"
                    name="Storage"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={28}
                  >
                    {storageByTag.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="analytics-empty">No data yet</div>
            )}
          </div>
        </div>

        {/* Security Overview */}
        <div className="analytics-chart-card">
          <div className="analytics-chart-card__header">
            <div>
              <h3><Lock size={18} /> Security Overview</h3>
              <span className="muted">Encryption & protection status</span>
            </div>
          </div>
          <div className="analytics-chart-card__body">
            <div className="analytics-security-grid">
              <SecurityMeter
                label="Advanced Security"
                value={security.advance_security ?? 0}
                total={security.total ?? 1}
                color="#6366f1"
              />
              <SecurityMeter
                label="Standard Encryption"
                value={security.standard_encryption ?? 0}
                total={security.total ?? 1}
                color="#38bdf8"
              />
              <SecurityMeter
                label="With Expiry Set"
                value={security.with_expiry ?? 0}
                total={security.total ?? 1}
                color="#fbbf24"
              />
              <SecurityMeter
                label="Shared Files"
                value={security.shared ?? 0}
                total={security.total ?? 1}
                color="#f472b6"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BOTTOM ROW ═══ */}
      <section className="analytics-bottom-grid">
        {/* Recent Activity */}
        <div className="analytics-chart-card">
          <div className="analytics-chart-card__header">
            <div>
              <h3><Activity size={18} /> Recent Activity</h3>
              <span className="muted">Last opened files</span>
            </div>
          </div>
          <div className="analytics-chart-card__body">
            {recentActivity.length > 0 ? (
              <div className="analytics-activity-list">
                {recentActivity.map((item, i) => (
                  <div key={i} className="analytics-activity-item">
                    <div className="analytics-activity-item__icon">
                      <Eye size={16} />
                    </div>
                    <div className="analytics-activity-item__info">
                      <span className="analytics-activity-item__name">{item.file_name}</span>
                      <span className="analytics-activity-item__date">{item.last_opened || 'Unknown'}</span>
                    </div>
                    <span className="analytics-activity-item__action">{item.action}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="analytics-empty">No recent activity</div>
            )}
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="analytics-chart-card">
          <div className="analytics-chart-card__header">
            <div>
              <h3><AlertTriangle size={18} /> Expiring Soon</h3>
              <span className="muted">Files expiring within 7 days</span>
            </div>
          </div>
          <div className="analytics-chart-card__body">
            {expiringSoon.length > 0 ? (
              <div className="analytics-expiry-list">
                {expiringSoon.map((item, i) => (
                  <div key={i} className="analytics-expiry-item">
                    <div className="analytics-expiry-item__icon">
                      <Clock size={16} />
                    </div>
                    <div className="analytics-expiry-item__info">
                      <span className="analytics-expiry-item__name">{item.file_name}</span>
                      <span className="analytics-expiry-item__days">
                        {item.days_left === 0 ? 'Expires today' : `${item.days_left} day${item.days_left !== 1 ? 's' : ''} left`}
                      </span>
                    </div>
                    <span className={`analytics-expiry-item__badge ${item.days_left <= 1 ? 'analytics-expiry-item__badge--urgent' : ''}`}>
                      {item.days_left <= 1 ? 'Urgent' : 'Soon'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="analytics-empty analytics-empty--positive">
                <ShieldCheck size={20} />
                <span>No files expiring soon</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
