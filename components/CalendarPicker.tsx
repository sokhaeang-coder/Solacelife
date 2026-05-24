// Shared calendar grid picker — used in FamilyScreen (DOB/anniversary) and
// MemoriesScreen (time capsule delivery date). Keep logic here so both screens
// stay in sync without duplicating code.
//
// Design decisions for senior users:
//   • Month: ‹ / › arrows — max 11 taps to get anywhere in the year
//   • Year:  « ‹ › » for ±10 / ±1 jumps, PLUS tap the year to type it directly
//   • Day: large tappable cells in a familiar calendar grid — no scrolling
//   • maxWidth: 420 caps the grid on wide web viewports (prevents giant circles)

import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, TextInput } from 'react-native'
import { C } from '../lib/constants'

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function CalendarPicker({
  value, onChange, maxYear, minYear,
}: {
  value: { month: number; day: number; year: number }
  onChange: (v: { month: number; day: number; year: number }) => void
  maxYear: number
  minYear: number
}) {
  const [viewMonth, setViewMonth] = useState(value.month)
  const [viewYear,  setViewYear]  = useState(value.year)
  const [editYear,  setEditYear]  = useState(false)
  const [yearDraft, setYearDraft] = useState(String(value.year))

  useEffect(() => {
    setViewMonth(value.month)
    setViewYear(value.year)
    setYearDraft(String(value.year))
  }, [value.month, value.year])

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => Math.max(minYear, y - 1)) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => Math.min(maxYear, y + 1)) }
    else setViewMonth(m => m + 1)
  }
  function shiftYear(delta: number) {
    setViewYear(y => Math.max(minYear, Math.min(maxYear, y + delta)))
  }
  function commitYear() {
    const y = parseInt(yearDraft, 10)
    if (!isNaN(y) && y >= minYear && y <= maxYear) setViewYear(y)
    else setYearDraft(String(viewYear))
    setEditYear(false)
  }

  const firstDow    = new Date(viewYear, viewMonth - 1, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const daysInPrev  = new Date(viewYear, viewMonth - 1, 0).getDate()
  const cells: Array<{ d: number; m: number; y: number; cur: boolean }> = []

  for (let i = firstDow - 1; i >= 0; i--) {
    const m = viewMonth === 1 ? 12 : viewMonth - 1
    const y = viewMonth === 1 ? viewYear - 1 : viewYear
    cells.push({ d: daysInPrev - i, m, y, cur: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, m: viewMonth, y: viewYear, cur: true })
  }
  let nd = 1
  while (cells.length % 7 !== 0) {
    const m = viewMonth === 12 ? 1 : viewMonth + 1
    const y = viewMonth === 12 ? viewYear + 1 : viewYear
    cells.push({ d: nd++, m, y, cur: false })
  }

  const today = new Date()
  function isSelected(c: typeof cells[0]) {
    return c.d === value.day && c.m === value.month && c.y === value.year
  }
  function isToday(c: typeof cells[0]) {
    return c.d === today.getDate() && c.m === today.getMonth() + 1 && c.y === today.getFullYear()
  }

  const rows = Math.ceil(cells.length / 7)

  return (
    <View style={{
      marginBottom: 16, borderRadius: 16, overflow: 'hidden',
      borderWidth: 1, borderColor: C.mauveDim + '99',
      backgroundColor: C.bg2,
      // Cap width on web — prevents flex:1 + aspectRatio:1 cells from
      // becoming enormous on a wide desktop viewport.
      maxWidth: 420, alignSelf: 'center', width: '100%',
    }}>

      {/* ── Month nav ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8, paddingVertical: 10,
        borderBottomWidth: 1, borderColor: C.mauveDim + '66',
        backgroundColor: C.mauveDim + '55',
      }}>
        <TouchableOpacity onPress={prevMonth}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={{ color: C.accent, fontSize: 28, fontWeight: '300', lineHeight: 32 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: C.offWhite, fontSize: 20, fontWeight: '700', letterSpacing: 0.3 }}>
          {MONTHS_LONG[viewMonth - 1]}
        </Text>
        <TouchableOpacity onPress={nextMonth}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={{ color: C.accent, fontSize: 28, fontWeight: '300', lineHeight: 32 }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Year nav — tap year to type directly ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 6, paddingVertical: 8,
        borderBottomWidth: 1, borderColor: C.mauveDim + '66',
        backgroundColor: C.mauveDim + '33',
      }}>
        <TouchableOpacity onPress={() => shiftYear(-10)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontSize: 20, fontWeight: '600' }}>«</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftYear(-1)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontSize: 24, fontWeight: '300' }}>‹</Text>
        </TouchableOpacity>

        {editYear ? (
          <TextInput
            value={yearDraft}
            onChangeText={setYearDraft}
            onBlur={commitYear}
            onSubmitEditing={commitYear}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            style={{
              color: C.amberLight, fontSize: 22, fontWeight: '800',
              textAlign: 'center', minWidth: 72,
              borderBottomWidth: 2, borderColor: C.amberLight,
              paddingBottom: 2,
            }}
          />
        ) : (
          <TouchableOpacity onPress={() => { setYearDraft(String(viewYear)); setEditYear(true) }}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            accessibilityLabel="Tap to type the year directly">
            <Text style={{ color: C.amberLight, fontSize: 22, fontWeight: '800' }}>
              {viewYear}
            </Text>
            <Text style={{ color: C.grey, fontSize: 10, textAlign: 'center', marginTop: 1 }}>
              tap to type
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => shiftYear(1)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontSize: 24, fontWeight: '300' }}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shiftYear(10)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontSize: 20, fontWeight: '600' }}>»</Text>
        </TouchableOpacity>
      </View>

      {/* ── Day-of-week headers ── */}
      <View style={{ flexDirection: 'row', backgroundColor: C.mauveDim + '22' }}>
        {DAY_HEADERS.map(h => (
          <View key={h} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: C.grey, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
              {h}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Calendar grid ── */}
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
            const sel = isSelected(cell)
            const tod = isToday(cell)
            return (
              <TouchableOpacity
                key={col}
                onPress={() => {
                  onChange({ day: cell.d, month: cell.m, year: cell.y })
                  if (!cell.cur) { setViewMonth(cell.m); setViewYear(cell.y) }
                }}
                style={{
                  flex: 1, aspectRatio: 1,
                  maxHeight: 52,
                  alignItems: 'center', justifyContent: 'center',
                  margin: 2, borderRadius: 100,
                  backgroundColor: sel ? C.accent : tod ? C.accent + '28' : 'transparent',
                }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: sel ? '800' : cell.cur ? '500' : '400',
                  color: sel ? C.bg1 : cell.cur ? C.offWhite : C.greyDim + '99',
                }}>
                  {cell.d}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}

      {/* ── Bottom hint ── */}
      <View style={{ padding: 10, alignItems: 'center',
        borderTopWidth: 1, borderColor: C.mauveDim + '44' }}>
        <Text style={{ color: C.greyDim, fontSize: 12 }}>
          Tap the year to type it directly
        </Text>
      </View>
    </View>
  )
}
