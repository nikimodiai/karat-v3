import React, { useMemo } from 'react';
import {
  MessageSquare, Package, Cpu, Shirt, ArrowRight,
  Gem, Users, Activity, BarChart as BarChartIcon, Layers,
  Info, Zap, ShieldCheck,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { useStoreData } from '../hooks/useStoreData';
import {
  effectiveLimit, planKey, PLAN_LABELS, analyticsTier, isProTier,
  conversationTokenCopy, hasFeature, fmtLimit,
} from '../lib/plans';
import { UpgradeBanner } from '../components/UpgradeNotice';
import CustomerInsights from '../components/CustomerInsights';
import styles from './Analytics.module.css';

const GOLD_PALETTE = ['#C9A84C','#E8CC7A','#8B6914','#d4a843','#f0e0a0','#a07830','#b5912a'];
const GREEN = '#22c55e';
const RED   = '#ef4444';
const NAVY  = '#17305A';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'#fff',border:'1px solid rgba(201,168,76,.18)',borderRadius:8,
      padding:'10px 14px',boxShadow:'0 4px 16px rgba(11,24,41,.1)',fontSize:12}}>
      {label && <div style={{fontWeight:600,color:'#0B1829',marginBottom:4}}>{label}</div>}
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.color||'#C9A84C',fontWeight:500,display:'flex',gap:6,alignItems:'center'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:p.color||'#C9A84C',display:'inline-block'}}/>
          {p.name}: <strong>{typeof p.value==='number'?p.value.toLocaleString():p.value}</strong>
        </div>
      ))}
    </div>
  );
};

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className={styles.sectionTitle}>
      <Icon size={17} strokeWidth={1.5} color="var(--gold-dk)" />
      {children}
    </div>
  );
}

function UsageCard({ icon: Icon, label, used, limit }) {
  const isUnlimited = !limit || limit === Infinity || limit === 'unlimited';
  const pct = isUnlimited ? 0 : Math.min(100, Math.round(used/limit*100));
  const fillColor = pct>=90?'#ef4444':pct>=70?'#f59e0b':'#22c55e';
  return (
    <div className={styles.usageCard}>
      <div className={styles.usageTop}>
        <div className={styles.usageIconWrap}><Icon size={15} strokeWidth={1.5} color="var(--gold-dk)"/></div>
        <span className={styles.usageLabel}>{label}</span>
      </div>
      <div className={styles.usageNumbers}>
        <span className={styles.usageUsed}>{Number(used || 0).toLocaleString('en-IN')}</span>
        {!isUnlimited && <span className={styles.usageLimit}>/ {fmtLimit(limit)}</span>}
        {isUnlimited && <span className={styles.usageLimit}>· unlimited</span>}
      </div>
      {!isUnlimited && (
        <>
          <div className={styles.usageTrack}>
            <div className={styles.usageFill} style={{width:`${pct}%`,background:fillColor}}/>
          </div>
          <div className={styles.usagePct} style={{color:fillColor}}>{pct}% used</div>
        </>
      )}
    </div>
  );
}

function ChartBox({ title, height=220, children }) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartTitle}>{title}</div>
      <div style={{height}}>{children}</div>
    </div>
  );
}

function EmptyChart({ icon: Icon, text }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      height:'100%',gap:8,color:'rgba(11,24,41,.35)',fontSize:12,padding:'12px 0'}}>
      <Icon size={30} strokeWidth={1}/>
      <span style={{textAlign:'center'}}>{text}</span>
    </div>
  );
}

export default function Analytics() {
  const { store } = useAuth();
  const { products, customers, monthlyUsage } = useStoreData();

  const planName = planKey(store);
  const planLabel = PLAN_LABELS[planName] || 'Trial';
  const isPro    = isProTier(store);                  // Trial counts as Pro
  const tier     = analyticsTier(store);              // 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
  const showPro  = tier === 'PROFESSIONAL' || tier === 'ENTERPRISE';

  // ── Limits ─────────────────────────────────────────────────────
  const convUsed  = store?._conv_used  || 0;
  const convLimit = effectiveLimit(store, 'conversations');
  const prodLimit = effectiveLimit(store, 'products');
  const aiUsed    = store?._ai_used    || 0;
  const aiLimit   = effectiveLimit(store, 'ai_models');
  const vtUsed    = store?._vt_used    || 0;

  // ── Aggregates ─────────────────────────────────────────────────
  const catData = useMemo(() => {
    const m = {};
    products.forEach(p => { const c = p.category || 'Other'; m[c]=(m[c]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  }, [products]);

  const matData = useMemo(() => {
    const m = {};
    products.forEach(p => { if(p.material){ m[p.material]=(m[p.material]||0)+1; }});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name,value])=>({name,value}));
  }, [products]);

  const caratData = useMemo(() => {
    const m = {};
    products.forEach(p => { if(p.gold_carat){ m[p.gold_carat]=(m[p.gold_carat]||0)+1; }});
    return Object.entries(m).map(([name,value])=>({name,value}));
  }, [products]);

  const inStock = products.filter(p=>p.in_stock===true).length;
  const soldOut = products.filter(p=>p.in_stock===false).length;
  const stockPie = [{name:'In Stock',value:inStock},{name:'Sold Out',value:soldOut}].filter(d=>d.value>0);

  const priceBuckets = useMemo(() => {
    const buckets = [
      {name:'<₹5K',    min:0,     max:5000,   value:0},
      {name:'₹5–15K',  min:5000,  max:15000,  value:0},
      {name:'₹15–50K', min:15000, max:50000,  value:0},
      {name:'₹50–1L',  min:50000, max:100000, value:0},
      {name:'>₹1L',    min:100000,max:Infinity,value:0},
    ];
    products.forEach(p => {
      if (!p.price) return;
      const b = buckets.find(b => p.price>=b.min && p.price<b.max);
      if (b) b.value++;
    });
    return buckets;
  }, [products]);

  const tierData = useMemo(() => {
    const m = {VVIP:0,VIP:0,Regular:0};
    customers.forEach(c=>{ if(m[c.tier]!==undefined) m[c.tier]++; });
    return Object.entries(m).map(([name,value])=>({name,value}));
  }, [customers]);

  // Build last-6-months trend from monthly_usage if available, else flat zeros
  const monthlyTrend = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        month: d.toLocaleDateString('en-IN', { month: 'short' }),
        conversations: i === 0 ? convUsed : 0,
      });
    }
    return out;
  }, [convUsed]);

  // Top-5 categories for the radial composition chart
  const radialData = catData.slice(0,5).map((d,i) => ({
    ...d,
    fill: GOLD_PALETTE[i],
    pct: products.length > 0 ? Math.round(d.value/products.length*100) : 0
  }));

  // Token / pricing copy
  const tokenInfo = conversationTokenCopy(planName);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Analytics</h2>
          <p className={styles.sub}>
            {tier === 'ENTERPRISE'   && `Enterprise insights · ${products.length} SKUs · ${customers.length} customers`}
            {tier === 'PROFESSIONAL' && `Advanced insights · ${planLabel} Plan · ${products.length} SKUs · ${customers.length} customers`}
            {tier === 'STARTER'      && `Inventory analytics · ${planLabel} Plan`}
          </p>
        </div>
      </div>

      <div className={styles.wrap}>
        {/* Upgrade banner — only for Starter (Trial gets Pro analytics) */}
        {!isPro && (
          <UpgradeBanner
            title="Unlock Full Analytics"
            message="Professional plan adds customer tier analysis, conversation trends, AI usage breakdown, and category composition."
            ctaLabel="Upgrade Plan"
          />
        )}

        {/* ── Usage This Month ───────────────────────────────────── */}
        <SectionTitle icon={Activity}>Usage This Month</SectionTitle>
        <div className={styles.usageGrid}>
          <UsageCard icon={MessageSquare} label="Conversations" used={convUsed}        limit={convLimit}/>
          <UsageCard icon={Package}       label="Products"      used={products.length} limit={prodLimit}/>
          {hasFeature(store, 'ai_models') && (
            <UsageCard icon={Cpu} label="AI Model Calls" used={aiUsed} limit={aiLimit}/>
          )}
          {hasFeature(store, 'virtual_tryon') && (
            <UsageCard icon={Shirt} label="Virtual Try-Ons" used={vtUsed} limit={Infinity}/>
          )}
        </div>


        {/* ── Inventory Breakdown — visible to all tiers ─────────── */}
        <SectionTitle icon={Package}>Inventory Breakdown</SectionTitle>
        <div className={styles.chartGrid}>
          <ChartBox title="Items by Category" height={240}>
            {catData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catData} margin={{top:4,right:4,left:-20,bottom:0}} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,24,41,.05)" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fontFamily:'DM Sans',fill:'rgba(11,24,41,.45)'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fontFamily:'DM Sans',fill:'rgba(11,24,41,.35)'}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="value" name="Products" radius={[5,5,0,0]}>
                    {catData.map((_,i)=><Cell key={i} fill={GOLD_PALETTE[i%GOLD_PALETTE.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={Package} text="Add products to see breakdown"/>}
          </ChartBox>

          <ChartBox title="Stock Status" height={240}>
            {stockPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stockPie} cx="50%" cy="45%" innerRadius={56} outerRadius={82}
                    paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                    <Cell fill={GREEN}/>
                    <Cell fill={RED}/>
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend iconType="circle" iconSize={9}
                    formatter={(v)=><span style={{fontSize:12,color:'rgba(11,24,41,.6)'}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={Gem} text="No inventory data yet"/>}
          </ChartBox>

          <ChartBox title="By Material" height={240}>
            {matData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={matData} cx="50%" cy="45%" outerRadius={78} paddingAngle={3}
                    dataKey="value" startAngle={90} endAngle={-270}>
                    {matData.map((_,i)=><Cell key={i} fill={GOLD_PALETTE[i%GOLD_PALETTE.length]}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend iconType="circle" iconSize={9}
                    formatter={(v)=><span style={{fontSize:11,color:'rgba(11,24,41,.55)'}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={Gem} text="No material data yet"/>}
          </ChartBox>
        </div>

        <div className={styles.chartGrid2}>
          <ChartBox title="Price Distribution" height={220}>
            {products.some(p=>p.price) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priceBuckets} margin={{top:4,right:4,left:-20,bottom:0}} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,24,41,.05)" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fontFamily:'DM Sans',fill:'rgba(11,24,41,.45)'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fontFamily:'DM Sans',fill:'rgba(11,24,41,.35)'}} axisLine={false} tickLine={false} allowDecimals={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="value" name="Products" fill={NAVY} radius={[5,5,0,0]}>
                    {priceBuckets.map((_,i)=><Cell key={i} fill={['#C9A84C','#8B6914','#17305A','#2558A0','#E8CC7A'][i]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={BarChartIcon} text="Add product prices to see distribution"/>}
          </ChartBox>

          <ChartBox title="Metal Purity Breakdown" height={220}>
            {caratData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={caratData} cx="50%" cy="50%" outerRadius={76} dataKey="value" paddingAngle={3}>
                    {caratData.map((_,i)=><Cell key={i} fill={GOLD_PALETTE[i%GOLD_PALETTE.length]}/>)}
                  </Pie>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend iconType="square" iconSize={9}
                    formatter={(v)=><span style={{fontSize:11,color:'rgba(11,24,41,.55)'}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart icon={Gem} text="Add products with metal info to see breakdown"/>}
          </ChartBox>
        </div>

        {/* ── Pro-tier analytics ─────────────────────────────────── */}
        {showPro && (
          <>
            <SectionTitle icon={Users}>Customer Insights</SectionTitle>
            <div className={styles.chartGrid}>
              <ChartBox title="Customer Tiers" height={220}>
                {customers.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tierData} margin={{top:4,right:4,left:-20,bottom:0}} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,24,41,.05)" vertical={false}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fontFamily:'DM Sans',fill:'rgba(11,24,41,.5)'}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9,fontFamily:'DM Sans',fill:'rgba(11,24,41,.35)'}} axisLine={false} tickLine={false} allowDecimals={false}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Bar dataKey="value" name="Customers" radius={[6,6,0,0]}>
                        <Cell fill="#C9A84C"/>
                        <Cell fill="#17305A"/>
                        <Cell fill="#64748b"/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart icon={Users} text="No customers yet"/>}
              </ChartBox>

              <ChartBox title="Conversation Trend (6 mo)" height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrend} margin={{top:4,right:4,left:-20,bottom:0}}>
                    <defs>
                      <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#C9A84C" stopOpacity={0.18}/>
                        <stop offset="95%" stopColor="#C9A84C" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,24,41,.05)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fontFamily:'DM Sans',fill:'rgba(11,24,41,.45)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:9,fontFamily:'DM Sans',fill:'rgba(11,24,41,.35)'}} axisLine={false} tickLine={false} allowDecimals={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Area type="monotone" dataKey="conversations" name="Conversations"
                      stroke="#C9A84C" strokeWidth={2} fill="url(#convGrad)"
                      dot={{r:4,fill:'#C9A84C',strokeWidth:0}} activeDot={{r:6}}/>
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBox>

              {hasFeature(store, 'ai_models') && (
                <ChartBox title="AI Model Usage" height={220}>
                  <div className={styles.aiUsageBox}>
                    <div className={styles.aiUsageBig}>
                      <Zap size={24} color="#7c3aed"/>
                      <div>
                        <div className={styles.aiUsageNum}>{aiUsed.toLocaleString('en-IN')}</div>
                        <div className={styles.aiUsageLbl}>calls this month</div>
                      </div>
                    </div>
                    <div className={styles.aiUsageMeta}>
                      <div><span>Limit</span><strong>{fmtLimit(aiLimit)}</strong></div>
                      <div><span>Model</span><strong>{tokenInfo.model}</strong></div>
                      <div><span>Source</span><strong>stores.ai_models_limit</strong></div>
                    </div>
                  </div>
                </ChartBox>
              )}
            </div>

            {/* Category composition radial */}
            {radialData.length > 0 && (
              <>
                <SectionTitle icon={Layers}>Category Composition</SectionTitle>
                <div className={styles.chartCard} style={{padding:'20px 24px'}}>
                  <div className={styles.chartTitle} style={{marginBottom:16}}>Top {radialData.length} Categories by Share</div>
                  <div className={styles.radialWrap}>
                    <div className={styles.radialChart}>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadialBarChart cx="50%" cy="50%" innerRadius={28} outerRadius={110}
                          data={radialData} startAngle={90} endAngle={-270} barSize={14}>
                          <RadialBar dataKey="value" cornerRadius={6} background={{fill:'rgba(11,24,41,.04)'}}>
                            {radialData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                          </RadialBar>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Legend iconSize={10} iconType="circle"
                            formatter={(v,e)=>(
                              <span style={{fontSize:12,color:'rgba(11,24,41,.65)'}}>
                                {e.payload?.name} ({e.payload?.pct}%)
                              </span>
                            )}/>
                        </RadialBarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className={styles.radialLegend}>
                      {radialData.map((d,i)=>(
                        <div key={i} className={styles.radialItem}>
                          <span style={{width:10,height:10,borderRadius:3,background:d.fill,display:'inline-block',flexShrink:0}}/>
                          <div>
                            <div className={styles.radialName}>{d.name}</div>
                            <div className={styles.radialVal}>{d.value} items · {d.pct}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Customer Interactions (Pro/Enterprise) ───────────── */}
        {showPro && (
          <>
            <SectionTitle icon={MessageSquare}>Customer Interactions — Last 7 Days</SectionTitle>
            <CustomerInsights />
          </>
        )}

        {/* ── Footer note ───────────────────────────────────────── */}
        <div className={styles.footerNote}>
          <ShieldCheck size={12}/>
          All numbers refresh on page load · Plan limits come from your <code>stores</code> row in Supabase.
        </div>
      </div>
    </div>
  );
}
