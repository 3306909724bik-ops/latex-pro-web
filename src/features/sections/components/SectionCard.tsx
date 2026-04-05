import { useMemo, useState } from 'react';
import { scheduleCompilePreviewCommand } from '../../preview/commands/compilePreviewCommand';
import { runSectionAICommand } from '../commands/runSectionAICommand';
import { useAppStore } from '../../../store/useAppStore';
import type {
  DocumentBlock,
  DocumentChartBlock,
  DocumentChartSeries,
  DocumentImageBlock,
  DocumentTableBlock,
  WorkspaceFile,
} from '../../../store/types';

interface SectionCardProps {
  sectionId: string;
}

const EMPTY_MESSAGE_IDS: string[] = [];

function createBlockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function getChartColors(): string[] {
  return ['#334155', '#2563eb', '#64748b', '#0f172a', '#0ea5e9', '#9333ea'];
}

function isImageFile(file: Pick<WorkspaceFile, 'mimeType'>): boolean {
  return file.mimeType.toLowerCase().startsWith('image/');
}

function toSectionKey(title: string, fallbackId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallbackId;
}

function StructuredTableBlockView({ block }: { block: DocumentTableBlock }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-sm font-semibold text-slate-800">{block.title || 'Structured Table'}</div>
        {block.note ? <div className="mt-1 text-xs text-slate-500">{block.note}</div> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              {block.columns.map((column, index) => (
                <th key={`${block.id}_head_${index}`} className="border-b border-slate-200 px-4 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${block.id}_row_${rowIndex}`} className="border-b border-slate-100 last:border-b-0">
                {block.columns.map((_, cellIndex) => (
                  <td key={`${block.id}_cell_${rowIndex}_${cellIndex}`} className="px-4 py-3 align-top text-slate-700">
                    {row[cellIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarChartSvg({ block }: { block: DocumentChartBlock }) {
  const labels = block.x;
  const maxValue = Math.max(1, ...block.series.flatMap((series) => series.values));
  const chartHeight = 180;
  const groupWidth = 72;
  const groupGap = 18;
  const leftPadding = 40;
  const rightPadding = 20;
  const bottomPadding = 40;
  const topPadding = 14;
  const innerHeight = chartHeight - topPadding - bottomPadding;
  const seriesCount = Math.max(block.series.length, 1);
  const barSlotWidth = Math.max(10, (groupWidth - 10) / seriesCount);
  const width = leftPadding + rightPadding + labels.length * (groupWidth + groupGap);
  const colors = getChartColors();

  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} className="h-[220px] min-w-[420px]">
      <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={chartHeight - bottomPadding} stroke="#94a3b8" strokeWidth="1" />
      <line
        x1={leftPadding}
        y1={chartHeight - bottomPadding}
        x2={width - rightPadding}
        y2={chartHeight - bottomPadding}
        stroke="#94a3b8"
        strokeWidth="1"
      />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = topPadding + (1 - ratio) * innerHeight;
        return (
          <g key={ratio}>
            <line x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={leftPadding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {(maxValue * ratio).toFixed(0)}
            </text>
          </g>
        );
      })}

      {labels.map((label, labelIndex) => {
        const groupX = leftPadding + labelIndex * (groupWidth + groupGap) + 10;
        return (
          <g key={`${block.id}_${labelIndex}`}>
            {block.series.map((series, seriesIndex) => {
              const value = series.values[labelIndex] ?? 0;
              const barHeight = (value / maxValue) * innerHeight;
              const x = groupX + seriesIndex * barSlotWidth;
              const y = chartHeight - bottomPadding - barHeight;
              const rectWidth = Math.max(barSlotWidth - 6, 8);

              return (
                <g key={`${series.label}_${seriesIndex}`}>
                  <rect x={x} y={y} width={rectWidth} height={barHeight} rx="4" fill={colors[seriesIndex % colors.length]} />
                  <text x={x + rectWidth / 2} y={y - 6} textAnchor="middle" fontSize="10" fill="#334155">
                    {value}
                  </text>
                </g>
              );
            })}
            <text x={groupX + groupWidth / 2 - 4} y={chartHeight - 12} textAnchor="middle" fontSize="10" fill="#475569">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChartSvg({ block }: { block: DocumentChartBlock }) {
  const labels = block.x;
  const maxValue = Math.max(1, ...block.series.flatMap((series) => series.values));
  const chartHeight = 180;
  const leftPadding = 40;
  const rightPadding = 20;
  const bottomPadding = 40;
  const topPadding = 16;
  const innerHeight = chartHeight - topPadding - bottomPadding;
  const innerWidth = Math.max(240, labels.length * 92);
  const width = leftPadding + rightPadding + innerWidth;
  const colors = getChartColors();
  const step = labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth / 2;

  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} className="h-[220px] min-w-[420px]">
      <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={chartHeight - bottomPadding} stroke="#94a3b8" strokeWidth="1" />
      <line
        x1={leftPadding}
        y1={chartHeight - bottomPadding}
        x2={width - rightPadding}
        y2={chartHeight - bottomPadding}
        stroke="#94a3b8"
        strokeWidth="1"
      />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = topPadding + (1 - ratio) * innerHeight;
        return (
          <g key={ratio}>
            <line x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={leftPadding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {(maxValue * ratio).toFixed(0)}
            </text>
          </g>
        );
      })}

      {block.series.map((series, seriesIndex) => {
        const color = colors[seriesIndex % colors.length];
        const points = labels
          .map((_, index) => {
            const value = series.values[index] ?? 0;
            const x = leftPadding + (labels.length > 1 ? index * step : innerWidth / 2);
            const y = chartHeight - bottomPadding - (value / maxValue) * innerHeight;
            return { x, y, value };
          })
          .filter(Boolean);

        return (
          <g key={`${block.id}_line_${seriesIndex}`}>
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="3"
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            />
            {points.map((point, pointIndex) => (
              <g key={`${block.id}_line_${seriesIndex}_${pointIndex}`}>
                <circle cx={point.x} cy={point.y} r="4" fill={color} />
                <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fill="#334155">
                  {point.value}
                </text>
              </g>
            ))}
          </g>
        );
      })}

      {labels.map((label, index) => {
        const x = leftPadding + (labels.length > 1 ? index * step : innerWidth / 2);
        return (
          <text key={`${block.id}_label_${index}`} x={x} y={chartHeight - 12} textAnchor="middle" fontSize="10" fill="#475569">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(' ');
}

function ScatterChartSvg({ block }: { block: DocumentChartBlock }) {
  const labels = block.x;
  const maxValue = Math.max(1, ...block.series.flatMap((series) => series.values));
  const chartHeight = 180;
  const leftPadding = 40;
  const rightPadding = 20;
  const bottomPadding = 40;
  const topPadding = 16;
  const innerHeight = chartHeight - topPadding - bottomPadding;
  const innerWidth = Math.max(240, labels.length * 92);
  const width = leftPadding + rightPadding + innerWidth;
  const colors = getChartColors();
  const step = labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth / 2;

  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} className="h-[220px] min-w-[420px]">
      <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={chartHeight - bottomPadding} stroke="#94a3b8" strokeWidth="1" />
      <line
        x1={leftPadding}
        y1={chartHeight - bottomPadding}
        x2={width - rightPadding}
        y2={chartHeight - bottomPadding}
        stroke="#94a3b8"
        strokeWidth="1"
      />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = topPadding + (1 - ratio) * innerHeight;
        return (
          <g key={ratio}>
            <line x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={leftPadding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {(maxValue * ratio).toFixed(0)}
            </text>
          </g>
        );
      })}

      {block.series.map((series, seriesIndex) => {
        const color = colors[seriesIndex % colors.length];
        return (
          <g key={`${block.id}_scatter_${seriesIndex}`}>
            {labels.map((label, index) => {
              const value = series.values[index] ?? 0;
              const x = leftPadding + (labels.length > 1 ? index * step : innerWidth / 2);
              const y = chartHeight - bottomPadding - (value / maxValue) * innerHeight;
              return (
                <g key={`${block.id}_scatter_${seriesIndex}_${index}`}>
                  <circle cx={x} cy={y} r="5" fill={color} fillOpacity="0.9" />
                  <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fill="#334155">
                    {value}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {labels.map((label, index) => {
        const x = leftPadding + (labels.length > 1 ? index * step : innerWidth / 2);
        return (
          <text key={`${block.id}_scatter_label_${index}`} x={x} y={chartHeight - 12} textAnchor="middle" fontSize="10" fill="#475569">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function PieChartSvg({ block }: { block: DocumentChartBlock }) {
  const width = 420;
  const height = 220;
  const cx = 130;
  const cy = 110;
  const radius = 72;
  const colors = getChartColors();
  const values = (block.series[0]?.values ?? []).map((value) => (Number.isFinite(value) ? value : 0));
  const total = Math.max(1, values.reduce((sum, value) => sum + value, 0));
  let currentAngle = 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] min-w-[420px]">
      {block.x.map((label, index) => {
        const value = values[index] ?? 0;
        const angle = (value / total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;
        const midAngle = startAngle + angle / 2;
        const labelPoint = polarToCartesian(cx, cy, radius + 24, midAngle);

        return (
          <g key={`${block.id}_slice_${index}`}>
            <path d={describeArc(cx, cy, radius, startAngle, endAngle)} fill={colors[index % colors.length]} stroke="#ffffff" strokeWidth="2" />
            <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" fontSize="10" fill="#334155">
              {value}
            </text>
            <g transform={`translate(${255}, ${28 + index * 26})`}>
              <rect width="12" height="12" rx="3" fill={colors[index % colors.length]} />
              <text x="20" y="10" fontSize="11" fill="#475569">
                {label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function StructuredChartBlockView({ block }: { block: DocumentChartBlock }) {
  const colors = getChartColors();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{block.title || 'Structured Chart'}</div>
          {block.yLabel ? <div className="mt-1 text-xs text-slate-500">Y: {block.yLabel}</div> : null}
        </div>
        <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {block.chartType}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {block.chartType === 'bar' ? <BarChartSvg block={block} /> : null}
        {block.chartType === 'line' ? <LineChartSvg block={block} /> : null}
        {block.chartType === 'pie' ? <PieChartSvg block={block} /> : null}
        {block.chartType === 'scatter' ? <ScatterChartSvg block={block} /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(block.chartType === 'pie' ? block.x : block.series.map((series) => series.label)).map((label, index) => (
          <div key={`${block.id}_legend_${label}_${index}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            {label}
          </div>
        ))}
      </div>

      {block.note ? <div className="mt-3 text-xs text-slate-500">{block.note}</div> : null}
      <div className="mt-2 text-[11px] text-slate-400">Workspace + PDF export path enabled for bar / line / pie / scatter.</div>
    </div>
  );
}

function BlockEditorHeader({
  title,
  typeLabel,
  onRemove,
}: {
  title: string;
  typeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{typeLabel}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
      >
        Remove block
      </button>
    </div>
  );
}

function TableBlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: DocumentTableBlock;
  onChange: (next: DocumentTableBlock) => void;
  onRemove: () => void;
}) {
  const updateColumn = (index: number, value: string) => {
    const nextColumns = block.columns.map((column, columnIndex) => (columnIndex === index ? value : column));
    const nextRows = block.rows.map((row) => {
      const paddedRow = [...row];
      while (paddedRow.length < nextColumns.length) {
        paddedRow.push('');
      }
      return paddedRow;
    });

    onChange({ ...block, columns: nextColumns, rows: nextRows });
  };

  const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
    const nextRows = block.rows.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) {
        return row;
      }

      const nextRow = [...row];
      while (nextRow.length < block.columns.length) {
        nextRow.push('');
      }
      nextRow[cellIndex] = value;
      return nextRow;
    });

    onChange({ ...block, rows: nextRows });
  };

  const addColumn = () => {
    onChange({
      ...block,
      columns: [...block.columns, `Column ${block.columns.length + 1}`],
      rows: block.rows.map((row) => [...row, '']),
    });
  };

  const removeColumn = (index: number) => {
    if (block.columns.length <= 1) {
      return;
    }

    onChange({
      ...block,
      columns: block.columns.filter((_, columnIndex) => columnIndex !== index),
      rows: block.rows.map((row) => row.filter((_, cellIndex) => cellIndex !== index)),
    });
  };

  const addRow = () => {
    onChange({
      ...block,
      rows: [...block.rows, Array.from({ length: block.columns.length }, () => '')],
    });
  };

  const removeRow = (index: number) => {
    if (block.rows.length <= 1) {
      return;
    }

    onChange({
      ...block,
      rows: block.rows.filter((_, rowIndex) => rowIndex !== index),
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <BlockEditorHeader title={block.title || 'Structured Table'} typeLabel="table block" onRemove={onRemove} />

      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={block.title ?? ''}
          onChange={(event) => onChange({ ...block, title: event.target.value })}
          placeholder="Table title"
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        />
        <input
          value={block.note ?? ''}
          onChange={(event) => onChange({ ...block, note: event.target.value })}
          placeholder="Table note"
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {block.columns.map((column, columnIndex) => (
                <th key={`${block.id}_edit_head_${columnIndex}`} className="border-b border-slate-200 px-2 py-2 align-top">
                  <div className="flex items-center gap-2">
                    <input
                      value={column}
                      onChange={(event) => updateColumn(columnIndex, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(columnIndex)}
                      disabled={block.columns.length <= 1}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      −
                    </button>
                  </div>
                </th>
              ))}
              <th className="border-b border-slate-200 px-2 py-2 text-right">
                <button
                  type="button"
                  onClick={addColumn}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  + Column
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${block.id}_edit_row_${rowIndex}`}>
                {block.columns.map((_, cellIndex) => (
                  <td key={`${block.id}_edit_cell_${rowIndex}_${cellIndex}`} className="border-b border-slate-100 px-2 py-2">
                    <input
                      value={row[cellIndex] ?? ''}
                      onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </td>
                ))}
                <td className="border-b border-slate-100 px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(rowIndex)}
                    disabled={block.rows.length <= 1}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove row
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          + Row
        </button>
      </div>
    </div>
  );
}

function updateSeriesValuesLength(series: DocumentChartSeries, targetLength: number): DocumentChartSeries {
  const values = [...series.values];
  while (values.length < targetLength) {
    values.push(0);
  }
  return {
    ...series,
    values: values.slice(0, targetLength),
  };
}

function ChartBlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: DocumentChartBlock;
  onChange: (next: DocumentChartBlock) => void;
  onRemove: () => void;
}) {
  const updateLabel = (index: number, value: string) => {
    onChange({
      ...block,
      x: block.x.map((label, labelIndex) => (labelIndex === index ? value : label)),
      series: block.series.map((series) => updateSeriesValuesLength(series, block.x.length)),
    });
  };

  const addLabel = () => {
    const nextLength = block.x.length + 1;
    onChange({
      ...block,
      x: [...block.x, `Item ${nextLength}`],
      series: block.series.map((series) => updateSeriesValuesLength({ ...series, values: [...series.values, 0] }, nextLength)),
    });
  };

  const removeLabel = (index: number) => {
    if (block.x.length <= 1) {
      return;
    }

    onChange({
      ...block,
      x: block.x.filter((_, labelIndex) => labelIndex !== index),
      series: block.series.map((series) => ({
        ...series,
        values: series.values.filter((_, valueIndex) => valueIndex !== index),
      })),
    });
  };

  const updateSeriesLabel = (seriesIndex: number, value: string) => {
    onChange({
      ...block,
      series: block.series.map((series, currentIndex) =>
        currentIndex === seriesIndex ? { ...series, label: value } : series,
      ),
    });
  };

  const updateSeriesValue = (seriesIndex: number, valueIndex: number, value: string) => {
    const numeric = Number(value);
    onChange({
      ...block,
      series: block.series.map((series, currentIndex) => {
        if (currentIndex !== seriesIndex) {
          return series;
        }

        const nextValues = [...series.values];
        nextValues[valueIndex] = Number.isFinite(numeric) ? numeric : 0;
        return { ...series, values: nextValues };
      }),
    });
  };

  const addSeries = () => {
    onChange({
      ...block,
      series: [
        ...block.series,
        {
          label: `Series ${block.series.length + 1}`,
          values: Array.from({ length: block.x.length }, () => 0),
        },
      ],
    });
  };

  const removeSeries = (seriesIndex: number) => {
    if (block.series.length <= 1) {
      return;
    }

    onChange({
      ...block,
      series: block.series.filter((_, currentIndex) => currentIndex !== seriesIndex),
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <BlockEditorHeader title={block.title || 'Structured Chart'} typeLabel="chart block" onRemove={onRemove} />

      <div className="grid gap-3 md:grid-cols-3">
        <input
          value={block.title ?? ''}
          onChange={(event) => onChange({ ...block, title: event.target.value })}
          placeholder="Chart title"
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        />
        <input
          value={block.yLabel ?? ''}
          onChange={(event) => onChange({ ...block, yLabel: event.target.value })}
          placeholder="Y-axis label"
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        />
        <select
          value={block.chartType}
          onChange={(event) => {
            const nextChartType = event.target.value as DocumentChartBlock['chartType'];
            onChange({
              ...block,
              chartType: nextChartType,
              series: nextChartType === 'pie' ? [block.series[0] ?? { label: 'Series 1', values: Array.from({ length: block.x.length }, () => 0) }] : block.series,
            });
          }}
          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
          <option value="scatter">Scatter</option>
        </select>
      </div>

      <input
        value={block.note ?? ''}
        onChange={(event) => onChange({ ...block, note: event.target.value })}
        placeholder="Chart note"
        className="mt-3 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      />

      <div className="mt-4 rounded-2xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {block.chartType === 'pie' ? 'Slices' : 'X labels'}
          </div>
          <button
            type="button"
            onClick={addLabel}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Label
          </button>
        </div>
        <div className="space-y-2">
          {block.x.map((label, labelIndex) => (
            <div key={`${block.id}_label_${labelIndex}`} className="flex items-center gap-2">
              <input
                value={label}
                onChange={(event) => updateLabel(labelIndex, event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => removeLabel(labelIndex)}
                disabled={block.x.length <= 1}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Series</div>
          <button
            type="button"
            onClick={addSeries}
            disabled={block.chartType === 'pie'}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Series
          </button>
        </div>

        {block.chartType === 'pie' ? (
          <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Pie chart uses a single series of slice values.
          </div>
        ) : null}

        <div className="space-y-4">
          {block.series.map((series, seriesIndex) => (
            <div key={`${block.id}_series_${seriesIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={series.label}
                  onChange={(event) => updateSeriesLabel(seriesIndex, event.target.value)}
                  placeholder="Series label"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  onClick={() => removeSeries(seriesIndex)}
                  disabled={block.series.length <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {block.x.map((label, valueIndex) => (
                  <label key={`${block.id}_series_${seriesIndex}_value_${valueIndex}`} className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">{label}</span>
                    <input
                      type="number"
                      value={series.values[valueIndex] ?? 0}
                      onChange={(event) => updateSeriesValue(seriesIndex, valueIndex, event.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StructuredImageBlockView({ block }: { block: DocumentImageBlock }) {
  const file = useAppStore((state) => state.files.byId[block.assetFileId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{block.title || file?.name || 'Structured Image'}</div>
          <div className="mt-1 text-xs text-slate-500">
            {file ? `${file.name} • ${Math.round((block.widthPercent ?? 85) || 85)}% width • ${block.placement || 'htbp'}` : 'Selected image file not found'}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          image
        </div>
      </div>

      {file?.objectUrl ? (
        <div className="bg-slate-50 px-4 py-4">
          <img
            src={file.objectUrl}
            alt={block.title || block.caption || file.name}
            className="max-h-[320px] w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        </div>
      ) : (
        <div className="px-4 py-6 text-sm text-slate-500">No local preview available for this image file.</div>
      )}

      {block.caption ? <div className="px-4 pb-4 text-sm text-slate-600">{block.caption}</div> : null}
    </div>
  );
}

function ImageBlockEditor({
  block,
  onChange,
  onRemove,
  imageFiles,
}: {
  block: DocumentImageBlock;
  onChange: (next: DocumentImageBlock) => void;
  onRemove: () => void;
  imageFiles: WorkspaceFile[];
}) {
  const selectedFile = imageFiles.find((file) => file.id === block.assetFileId);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <BlockEditorHeader title={block.title || 'Structured Image'} typeLabel="image block" onRemove={onRemove} />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Image file</span>
          <select
            value={block.assetFileId}
            onChange={(event) => onChange({ ...block, assetFileId: event.target.value })}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          >
            {imageFiles.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Figure title</span>
          <input
            value={block.title ?? ''}
            onChange={(event) => onChange({ ...block, title: event.target.value })}
            placeholder="Figure title"
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Width</span>
          <input
            type="number"
            min={10}
            max={100}
            value={block.widthPercent ?? 85}
            onChange={(event) => {
              const numeric = Number(event.target.value);
              onChange({
                ...block,
                widthPercent: Number.isFinite(numeric) ? Math.min(Math.max(numeric, 10), 100) : 85,
              });
            }}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Placement</span>
          <select
            value={block.placement ?? 'htbp'}
            onChange={(event) => onChange({ ...block, placement: event.target.value as DocumentImageBlock['placement'] })}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="htbp">Auto (htbp)</option>
            <option value="t">Top (t)</option>
            <option value="b">Bottom (b)</option>
            <option value="p">Page (p)</option>
          </select>
        </label>
      </div>

      <textarea
        value={block.caption ?? ''}
        onChange={(event) => onChange({ ...block, caption: event.target.value })}
        placeholder="Figure caption"
        className="mt-3 min-h-[88px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      />

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Preview</div>
        {selectedFile?.objectUrl ? (
          <img
            src={selectedFile.objectUrl}
            alt={block.title || block.caption || selectedFile.name}
            className="max-h-[320px] w-full rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
            No object URL available for this image file.
          </div>
        )}
        <div className="mt-2 text-xs text-slate-500">{selectedFile ? selectedFile.name : 'Selected image file not found.'}</div>
      </div>
    </div>
  );
}

function StructuredBlockEditor({
  block,
  onChange,
  onRemove,
  imageFiles,
}: {
  block: DocumentBlock;
  onChange: (next: DocumentBlock) => void;
  onRemove: () => void;
  imageFiles: WorkspaceFile[];
}) {
  if (block.type === 'table') {
    return <TableBlockEditor block={block} onChange={onChange} onRemove={onRemove} />;
  }

  if (block.type === 'image') {
    return <ImageBlockEditor block={block} onChange={onChange} onRemove={onRemove} imageFiles={imageFiles} />;
  }

  return <ChartBlockEditor block={block} onChange={onChange} onRemove={onRemove} />;
}

function StructuredBlockView({ block }: { block: DocumentBlock }) {
  if (block.type === 'table') {
    return <StructuredTableBlockView block={block} />;
  }

  if (block.type === 'image') {
    return <StructuredImageBlockView block={block} />;
  }

  return <StructuredChartBlockView block={block} />;
}

export function SectionCard({ sectionId }: SectionCardProps) {
  const [localPrompt, setLocalPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingBlocks, setEditingBlocks] = useState<Record<string, boolean>>({});

  const section = useAppStore((state) => state.document.sectionsById[sectionId]);
  const sectionOrder = useAppStore((state) => state.document.sectionOrder);
  const sectionMessageIds = useAppStore((state) => state.chat.sectionMessageIds[sectionId] ?? EMPTY_MESSAGE_IDS);
  const messagesById = useAppStore((state) => state.chat.messagesById);
  const snapshotsBySectionId = useAppStore((state) => state.snapshots.bySectionId);
  const filesById = useAppStore((state) => state.files.byId);
  const previewStatus = useAppStore((state) => state.ui.preview.status);
  const previewNeedsRefresh = useAppStore((state) => state.ui.preview.needsRefresh);
  const actions = useAppStore((state) => state.actions);

  const imageFiles = useMemo(
    () =>
      Object.values(filesById)
        .filter((file): file is WorkspaceFile => Boolean(file) && isImageFile(file))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filesById],
  );

  const workspaceFiles = useMemo(
    () =>
      Object.values(filesById)
        .filter((file): file is WorkspaceFile => Boolean(file))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filesById],
  );

  const sectionMessages = useMemo(
    () => sectionMessageIds.map((messageId) => messagesById[messageId]).filter(Boolean),
    [messagesById, sectionMessageIds],
  );
  const snapshots = snapshotsBySectionId[sectionId];
  const snapshotCount = snapshots?.length ?? 0;

  if (!section) {
    return null;
  }

  const sectionIndex = sectionOrder.indexOf(sectionId);
  const canMoveUp = sectionIndex > 0;
  const canMoveDown = sectionIndex >= 0 && sectionIndex < sectionOrder.length - 1;

  const applyBlocksUpdate = (nextBlocks: DocumentBlock[]) => {
    actions.updateSectionBlocks(sectionId, nextBlocks);
  };

  const toggleLinkedFile = (fileId: string) => {
    const linkedFileIds = section.linkedFileIds.includes(fileId)
      ? section.linkedFileIds.filter((id) => id !== fileId)
      : [...section.linkedFileIds, fileId];

    actions.updateSectionMeta(sectionId, {
      linkedFileIds,
    });
  };

  const toggleBlockEditing = (blockId: string) => {
    setEditingBlocks((current) => ({
      ...current,
      [blockId]: !current[blockId],
    }));
  };

  const handleTitleChange = (title: string) => {
    actions.updateSectionMeta(sectionId, {
      title,
      key: toSectionKey(title, section.id),
    });
  };

  const moveSection = (direction: -1 | 1) => {
    const targetIndex = sectionIndex + direction;
    if (targetIndex < 0 || targetIndex >= sectionOrder.length) {
      return;
    }

    const nextOrder = [...sectionOrder];
    const [movedSectionId] = nextOrder.splice(sectionIndex, 1);
    nextOrder.splice(targetIndex, 0, movedSectionId);
    actions.reorderSections(nextOrder);
  };

  const addTableBlock = () => {
    applyBlocksUpdate([
      ...(section.blocks ?? []),
      {
        id: createBlockId('table'),
        type: 'table',
        title: 'New Table',
        columns: ['Column 1', 'Column 2'],
        rows: [['', '']],
        note: '',
      },
    ]);
  };

  const addChartBlock = () => {
    applyBlocksUpdate([
      ...(section.blocks ?? []),
      {
        id: createBlockId('chart'),
        type: 'chart',
        chartType: 'bar',
        title: 'New Chart',
        x: ['Item 1', 'Item 2'],
        series: [{ label: 'Series 1', values: [0, 0] }],
        yLabel: '',
        note: '',
      },
    ]);
  };

  const addImageBlock = () => {
    const defaultImageFile = imageFiles[0];
    if (!defaultImageFile) {
      return;
    }

    applyBlocksUpdate([
      ...(section.blocks ?? []),
      {
        id: createBlockId('image'),
        type: 'image',
        assetFileId: defaultImageFile.id,
        title: defaultImageFile.name.replace(/\.[^.]+$/, ''),
        caption: '',
        widthPercent: 85,
        placement: 'htbp',
      },
    ]);
  };

  const updateBlock = (blockId: string, nextBlock: DocumentBlock) => {
    applyBlocksUpdate((section.blocks ?? []).map((block) => (block.id === blockId ? nextBlock : block)));
  };

  const removeBlock = (blockId: string) => {
    applyBlocksUpdate((section.blocks ?? []).filter((block) => block.id !== blockId));
    setEditingBlocks((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  };

  const handleUndo = async () => {
    actions.undoSection(sectionId);
    try {
      await scheduleCompilePreviewCommand();
    } catch {
      // no-op
    }
  };

  const handleSectionAI = async () => {
    const prompt = localPrompt.trim();
    if (!prompt || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await runSectionAICommand(sectionId, prompt);
      setLocalPrompt('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveSection = async () => {
    actions.removeSection(sectionId);
    try {
      await scheduleCompilePreviewCommand();
    } catch {
      // no-op
    }
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full space-y-2">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              value={section.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Section title"
            />
            <div className="text-xs text-slate-400">key: {section.key}</div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <div className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">{section.status}</div>
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => moveSection(-1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => moveSection(1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={snapshotCount === 0}
              onClick={() => void handleUndo()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => void handleRemoveSection()}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
            >
              Remove
            </button>
          </div>
        </div>

        <textarea
          className="min-h-[140px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="Write or paste this section's body..."
          value={section.content}
          onChange={(event) => actions.updateSectionContent(sectionId, event.target.value)}
        />

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Structured blocks</div>
              <div className="mt-1 text-xs text-slate-500">Editable tables, charts, and image figures attached to this section</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addTableBlock}
                className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
              >
                + Table
              </button>
              <button
                type="button"
                onClick={addChartBlock}
                className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
              >
                + Chart
              </button>
              <button
                type="button"
                onClick={addImageBlock}
                disabled={imageFiles.length === 0}
                className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Image
              </button>
            </div>
          </div>

          {(section.blocks ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              No structured blocks yet. Add one manually or ask Section AI to generate a table / chart / image figure.
            </div>
          ) : (
            <div className="space-y-3">
              {(section.blocks ?? []).map((block) => {
                const isEditing = Boolean(editingBlocks[block.id]);
                return (
                  <div key={block.id} className="space-y-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleBlockEditing(block.id)}
                        className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white"
                      >
                        {isEditing ? 'Done' : 'Edit block'}
                      </button>
                    </div>
                    {isEditing ? (
                      <StructuredBlockEditor
                        block={block}
                        imageFiles={imageFiles}
                        onChange={(nextBlock) => updateBlock(block.id, nextBlock)}
                        onRemove={() => removeBlock(block.id)}
                      />
                    ) : (
                      <StructuredBlockView block={block} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Linked context files</div>
              <div className="mt-1 text-xs text-slate-500">Manually control which workspace files are explicitly linked to this section.</div>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
              {section.linkedFileIds.length} linked
            </div>
          </div>

          {workspaceFiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
              No uploaded files available yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {workspaceFiles.map((file) => {
                const linked = section.linkedFileIds.includes(file.id);
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleLinkedFile(file.id)}
                    className={`rounded-full border px-3 py-2 text-xs transition ${
                      linked
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {file.bucket} · {file.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Section AI</div>

          <div className="mb-3 max-h-[220px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
            {sectionMessages.length === 0 ? (
              <div className="text-sm leading-6 text-slate-500">这一节的 AI 修改记录会显示在这里。</div>
            ) : (
              <div className="space-y-3">
                {sectionMessages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <div
                      key={message.id}
                      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                        isUser
                          ? 'ml-auto max-w-[85%] border-slate-900 bg-slate-900 text-white'
                          : message.status === 'error'
                            ? 'max-w-[88%] border-rose-200 bg-rose-50 text-rose-700'
                            : 'max-w-[88%] border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
                        {isUser ? 'You' : 'Section AI'}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>

                      {message.referencedFileIds && message.referencedFileIds.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
                          {message.referencedFileIds
                            .map((fileId) => filesById[fileId])
                            .filter(Boolean)
                            .map((file) => (
                              <span
                                key={`${message.id}_${file.id}`}
                                className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                                  isUser ? 'bg-white/10 text-white/80' : 'border border-slate-200 bg-white text-slate-500'
                                }`}
                              >
                                {file.bucket} · {file.name}
                              </span>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <textarea
            className="min-h-[92px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="例如：润色这一节、扩写结果分析、生成一个结构化表格、补一个折线图或饼图。"
            value={localPrompt}
            onChange={(event) => setLocalPrompt(event.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void scheduleCompilePreviewCommand()}
              disabled={previewStatus === 'compiling'}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {previewStatus === 'compiling' ? 'Compiling…' : previewNeedsRefresh ? 'Recompile' : 'Compile'}
            </button>
            <button
              type="button"
              onClick={() => void handleSectionAI()}
              disabled={submitting || !localPrompt.trim()}
              className="rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
