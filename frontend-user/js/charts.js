/* ========================================
   图表组件
   - 数据由外部快照(snapshot)注入，刷新后与数据源保持一致
   - 通过 ResizeObserver 跟随容器尺寸自适应，不依赖窗口 resize 事件
   ======================================== */

class ChartManager {
    constructor() {
        this.charts = {};
        this.data = null;
        this.resizeObserver = null;
        this.resizeRaf = 0;
        this.observedContainers = [];
    }

    // 初始化漏斗图
    initFunnelChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const chart = echarts.init(container, null, { renderer: 'canvas' });
        this.charts.funnel = chart;
        chart.setOption(this.buildFunnelOption(data.funnel));

        chart.on('click', (params) => {
            window.toast.info('漏斗分析', `${params.name}: 转化率 ${params.value}%`);
        });

        return chart;
    }

    buildFunnelOption(funnel) {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c}%',
                backgroundColor: 'rgba(20, 20, 35, 0.95)',
                borderColor: 'rgba(168, 85, 247, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f8fafc' },
                extraCssText: 'backdrop-filter: blur(10px); border-radius: 8px;'
            },
            series: [{
                type: 'funnel',
                left: '10%',
                right: '10%',
                top: '8%',
                bottom: '8%',
                width: '80%',
                min: 0,
                max: 100,
                minSize: '0%',
                maxSize: '100%',
                sort: 'descending',
                gap: 3,
                label: {
                    show: true,
                    position: 'inside',
                    formatter: '{b}\n{c}%',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                },
                labelLine: { show: false },
                itemStyle: {
                    borderColor: 'rgba(168, 85, 247, 0.5)',
                    borderWidth: 2,
                    shadowBlur: 20,
                    shadowColor: 'rgba(168, 85, 247, 0.3)'
                },
                emphasis: {
                    label: { fontSize: 15 },
                    itemStyle: {
                        shadowBlur: 30,
                        shadowColor: 'rgba(168, 85, 247, 0.5)'
                    }
                },
                data: funnel.map(item => ({
                    value: item.value,
                    name: item.name,
                    itemStyle: { color: item.color }
                }))
            }]
        };
    }

    // 初始化雷达图
    initRadarChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        const chart = echarts.init(container, null, { renderer: 'canvas' });
        this.charts.radar = chart;
        chart.setOption(this.buildRadarOption(data.radar));

        chart.on('click', (params) => {
            if (params.name) {
                window.toast.info('能力对比', `${params.seriesName}: ${params.name}`);
            }
        });

        return chart;
    }

    buildRadarOption(radar) {
        return {
            backgroundColor: 'transparent',
            legend: {
                data: radar.series.map(s => s.name),
                bottom: 0,
                textStyle: { color: '#94a3b8', fontSize: 12 },
                itemWidth: 16,
                itemHeight: 10,
                itemGap: 20
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(20, 20, 35, 0.95)',
                borderColor: 'rgba(168, 85, 247, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f8fafc' },
                extraCssText: 'backdrop-filter: blur(10px); border-radius: 8px;'
            },
            radar: {
                indicator: radar.indicators,
                shape: 'polygon',
                splitNumber: 4,
                center: ['50%', '48%'],
                radius: '65%',
                axisName: {
                    color: '#94a3b8',
                    fontSize: 12,
                    fontWeight: 500
                },
                splitLine: {
                    lineStyle: {
                        color: 'rgba(168, 85, 247, 0.15)',
                        width: 1
                    }
                },
                splitArea: {
                    areaStyle: {
                        color: ['rgba(168, 85, 247, 0.02)', 'rgba(168, 85, 247, 0.06)']
                    }
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(168, 85, 247, 0.2)'
                    }
                }
            },
            series: [{
                type: 'radar',
                data: radar.series.map(s => ({
                    value: s.value,
                    name: s.name,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: {
                        color: s.color,
                        width: 2,
                        shadowBlur: 10,
                        shadowColor: s.color
                    },
                    areaStyle: { color: s.areaColor },
                    itemStyle: {
                        color: s.color,
                        borderColor: '#fff',
                        borderWidth: 2
                    }
                }))
            }]
        };
    }

    // 按数据快照初始化全部图表
    init(snapshot) {
        this.data = snapshot;
        this.initFunnelChart('funnelChart', snapshot);
        this.initRadarChart('radarChart', snapshot);
        this.observeContainers();
    }

    // 刷新完成后：只更新数据，不重建图表，避免闪烁
    setData(snapshot) {
        this.data = snapshot;
        if (this.charts.funnel) {
            this.charts.funnel.setOption(this.buildFunnelOption(snapshot.funnel), true);
        }
        if (this.charts.radar) {
            this.charts.radar.setOption(this.buildRadarOption(snapshot.radar), true);
        }
        // 数据变更后容器尺寸可能随布局微调，下一帧校准一次
        this.scheduleResize();
    }

    // 监听图表容器自身尺寸变化（窄屏缩放、CSS 断点切换均可覆盖）
    observeContainers() {
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', () => this.scheduleResize(), { passive: true });
            return;
        }

        this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
        Object.values(this.charts).forEach(chart => {
            const el = chart.getDom();
            // 容器初始宽度为 0（如 display:none）时跳过，恢复可见后回调会再次触发
            if (el && el.clientWidth > 0) {
                this.resizeObserver.observe(el);
                this.observedContainers.push(el);
            }
        });
    }

    // rAF 合流：一个渲染帧内无论触发多少次尺寸变化，只 resize 一次
    scheduleResize() {
        if (this.resizeRaf) return;
        this.resizeRaf = requestAnimationFrame(() => {
            this.resizeRaf = 0;
            this.resize();
        });
    }

    // 响应式调整
    resize() {
        Object.values(this.charts).forEach(chart => {
            const el = chart.getDom();
            // 隐藏容器宽高为 0 时不调整，避免 ECharts 内部尺寸被压成 0
            if (chart && chart.resize && el && el.clientWidth > 0 && el.clientHeight > 0) {
                chart.resize();
            }
        });
    }

    // 销毁图表
    dispose() {
        if (this.resizeObserver) {
            this.observedContainers.forEach(el => this.resizeObserver.unobserve(el));
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
            this.resizeRaf = 0;
        }
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.dispose) {
                chart.dispose();
            }
        });
        this.charts = {};
        this.observedContainers = [];
    }
}

// 创建全局实例
window.chartManager = new ChartManager();
