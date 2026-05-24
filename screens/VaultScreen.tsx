import { useState, useEffect } from 'react'
import { Text, View, TouchableOpacity, TextInput, ActivityIndicator,
  ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../lib/supabase'
import { C, WARM, WM, PLUM } from '../lib/constants'
import { s } from '../lib/styles'
import ScreenWrap from '../components/ScreenWrap'
import { encryptVaultPayload, decryptVaultItems } from '../lib/encryption'
import FacebookImportModal from './FacebookImportModal'
import ProfessionalServicesModal from './ProfessionalServicesModal'

const VAULT_CATEGORIES = [
  { key: 'legal',             label: 'Legal',           icon: '📜', desc: 'Will, power of attorney, trusts' },
  { key: 'financial',         label: 'Financial',       icon: '💰', desc: 'Accounts, insurance, investments' },
  { key: 'property',          label: 'Property',        icon: '🏠', desc: 'Deeds, titles, mortgages' },
  { key: 'personal_messages', label: 'Messages',        icon: '✉️', desc: 'Letters and video messages' },
  { key: 'medical',           label: 'Medical',         icon: '🏥', desc: 'Records, directives, contacts' },
  { key: 'digital_assets',    label: 'Passwords',        icon: '🔑', desc: 'Email, social media & streaming logins' },
]

function fileIcon(mimeType: string | null) {
  if (!mimeType) return '📄'
  if (mimeType.startsWith('image/'))                              return '🖼️'
  if (mimeType.startsWith('video/'))                              return '🎬'
  if (mimeType.startsWith('audio/'))                              return '🎙️'
  if (mimeType.includes('pdf'))                                   return '📑'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊'
  return '📄'
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024)    return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

const EMPTY_VAULT_FORM = { title: '', category: 'legal', description: '', content: '', username: '', password: '' }

export default function VaultScreen() {
  const [counts, setCounts]           = useState<Record<string, number>>({})
  const [recentItems, setRecentItems] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form, setForm]               = useState({ ...EMPTY_VAULT_FORM })
  const [pickedFile, setPickedFile]   = useState<any>(null)
  const [removeExistingFile, setRemoveExistingFile] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [deleting, setDeleting]           = useState(false)
  const [activeFilter, setActiveFilter]   = useState('all')
  const [showPassword, setShowPassword]   = useState(false)
  const [showFbModal, setShowFbModal]         = useState(false)
  const [showPartnersModal, setShowPartnersModal] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [catRes, recentRes] = await Promise.all([
      supabase.from('vault_items').select('category').eq('user_id', user.id),
      supabase.from('vault_items').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(20),
    ])
    const tally: Record<string, number> = {}
    catRes.data?.forEach(row => { tally[row.category] = (tally[row.category] || 0) + 1 })
    setCounts(tally)
    setRecentItems(await decryptVaultItems(recentRes.data || []))
    setLoading(false)
  }

  function openAddModal() {
    const category = activeFilter !== 'all' ? activeFilter : VAULT_CATEGORIES[0].key
    setEditingItem(null); setForm({ ...EMPTY_VAULT_FORM, category })
    setPickedFile(null); setRemoveExistingFile(false); setSaveMsg(''); setShowModal(true)
  }

  function openEditModal(item: any) {
    setEditingItem(item)
    setForm({ title: item.title || '', category: item.category || 'legal',
      description: item.description || '', content: item.content || '',
      username: item.username || '', password: item.password || '' })
    setPickedFile(null); setRemoveExistingFile(false); setSaveMsg(''); setShowModal(true)
  }

  function closeModal() {
    setShowModal(false); setEditingItem(null); setPickedFile(null)
    setRemoveExistingFile(false); setSaveMsg(''); setForm({ ...EMPTY_VAULT_FORM })
    setShowPassword(false)
  }

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      if (!result.canceled && result.assets?.length > 0) {
        setPickedFile(result.assets[0]); setRemoveExistingFile(false)
      }
    } catch (e: any) { setSaveMsg('Could not open file picker: ' + e.message) }
  }

  async function handleSave() {
    if (!form.title.trim()) { setSaveMsg('Please enter a title.'); return }
    setSaving(true); setSaveMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaveMsg('Not signed in.'); setSaving(false); return }

    let file_path = editingItem?.file_path ?? null
    let file_name = editingItem?.file_name ?? null
    let file_size = editingItem?.file_size ?? null
    let file_type = editingItem?.file_type ?? null

    if ((removeExistingFile || pickedFile) && editingItem?.file_path) {
      await supabase.storage.from('vault-files').remove([editingItem.file_path])
      file_path = null; file_name = null; file_size = null; file_type = null
    }

    if (pickedFile) {
      setUploading(true)
      try {
        const response = await fetch(pickedFile.uri)
        const blob = await response.blob()
        const path = `${user.id}/${Date.now()}_${pickedFile.name}`
        const { error: uploadError } = await supabase.storage.from('vault-files')
          .upload(path, blob, { contentType: pickedFile.mimeType || 'application/octet-stream' })
        if (uploadError) { setSaveMsg('File upload failed: ' + uploadError.message); setSaving(false); setUploading(false); return }
        file_path = path; file_name = pickedFile.name; file_size = pickedFile.size; file_type = pickedFile.mimeType
      } catch (e: any) { setSaveMsg('Upload error: ' + e.message); setSaving(false); setUploading(false); return }
      setUploading(false)
    }

    const rawPayload = { title: form.title.trim(), category: form.category,
      description: form.description.trim() || null, content: form.content.trim() || null,
      username: form.username.trim() || null, password: form.password.trim() || null,
      file_path, file_name, file_size, file_type }

    // Encrypt sensitive fields (password, content, username) before storing
    const payload = await encryptVaultPayload(rawPayload)

    let error: any = null
    if (editingItem) {
      const res = await supabase.from('vault_items').update(payload).eq('id', editingItem.id)
      error = res.error
    } else {
      const res = await supabase.from('vault_items').insert({ user_id: user.id, ...payload })
      error = res.error
    }
    setSaving(false)
    if (error) { setSaveMsg('Error saving: ' + error.message) }
    else { closeModal(); loadAll() }
  }

  async function handleDeleteItem() {
    if (!confirmDelete) return
    setDeleting(true)
    if (confirmDelete.file_path) await supabase.storage.from('vault-files').remove([confirmDelete.file_path])
    await supabase.from('vault_items').delete().eq('id', confirmDelete.id)
    setDeleting(false); setConfirmDelete(null); loadAll()
  }

  const existingFile = editingItem && !removeExistingFile && !pickedFile
    ? { name: editingItem.file_name, size: editingItem.file_size, mimeType: editingItem.file_type } : null

  const filteredItems = activeFilter === 'all'
    ? recentItems
    : recentItems.filter(i => i.category === activeFilter)

  return (
    <ScreenWrap>
      <ScrollView contentContainerStyle={s.screenScroll} showsVerticalScrollIndicator={true}>

        {/* Page Header */}
        <View style={s.pageHeaderPlain}>
          <Text style={s.pageTitle}>My Vault</Text>
          <Text style={s.pageSubtitle}>Your secure documents</Text>
        </View>

        {/* Category Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterScroll}>
          <TouchableOpacity
            style={[s.filterPill, activeFilter === 'all' && s.filterPillActive]}
            onPress={() => setActiveFilter('all')}>
            <Text style={[s.filterPillText, activeFilter === 'all' && s.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {VAULT_CATEGORIES.map(cat => (
            <TouchableOpacity key={cat.key}
              style={[s.filterPill, activeFilter === cat.key && s.filterPillActive]}
              onPress={() => setActiveFilter(cat.key)}>
              <Text style={[s.filterPillText, activeFilter === cat.key && s.filterPillTextActive]}>
                {cat.icon} {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity activeOpacity={0.85} style={s.addBtn} onPress={openAddModal}>
          <LinearGradient colors={[C.amberLight, C.amber, '#C07840']} style={s.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={s.btnPrimaryText}>+ Add Item to Vault</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[s.addBtn, { marginTop: -4 }]}
          onPress={() => setShowFbModal(true)}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 10, backgroundColor: '#1877F2', borderRadius: 14, padding: 14,
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', fontStyle: 'italic' }}>f</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Import from Facebook</Text>
          </View>
        </TouchableOpacity>

        {/* First-time vault setup nudge — shown only when vault is empty */}
        {!loading && recentItems.length === 0 && activeFilter === 'all' && (
          <View style={{
            marginHorizontal: 20, marginBottom: 20, borderRadius: 20,
            borderWidth: 1, borderColor: C.amber + '44',
            backgroundColor: C.amber + '0E', padding: 20,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.amberLight, marginBottom: 6 }}>
              🏛️ Build your vault when you're ready
            </Text>
            <Text style={{ color: C.grey, fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
              Most people start with one thing — a will, an insurance policy, a list of accounts. There's no rush and no right order.
            </Text>
            {[
              { icon: '📜', label: 'Legal — Will, trust, power of attorney' },
              { icon: '💰', label: 'Financial — Accounts, insurance, investments' },
              { icon: '🔑', label: 'Logins — Email, social media, streaming' },
              { icon: '✉️', label: 'Personal — Letters and video messages' },
            ].map((tip, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 18 }}>{tip.icon}</Text>
                <Text style={{ color: C.offWhite, fontSize: 13 }}>{tip.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Contextual partner nudge for Legal, Financial & Property categories ── */}
        {(activeFilter === 'legal' || activeFilter === 'financial' || activeFilter === 'property') && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowPartnersModal(true)}
            style={{
              marginHorizontal: 20, marginBottom: 16, borderRadius: 16,
              borderWidth: 1, borderColor: C.accent + '44',
              backgroundColor: C.accent + '0E', padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 14,
            }}>
            <Text style={{ fontSize: 26 }}>
              {activeFilter === 'legal' ? '⚖️' : activeFilter === 'financial' ? '💰' : '🏠'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.offWhite, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                Want help from a professional?
              </Text>
              <Text style={{ color: C.grey, fontSize: 12 }}>
                {activeFilter === 'legal'
                  ? 'Connect with a trusted estate lawyer in your area'
                  : activeFilter === 'financial'
                  ? 'Connect with a trusted financial advisor in your area'
                  : 'Connect with a trusted real estate agent in your area'}
              </Text>
            </View>
            <Text style={{ color: C.accent, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        )}

        {loading ? <ActivityIndicator color={C.amber} style={{ marginTop: 20 }} /> : (
          filteredItems.length === 0 ? (
            activeFilter === 'all' ? null : (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🔐</Text>
                <Text style={s.emptyTitle}>Nothing in this category yet</Text>
                <Text style={s.emptyDesc}>Tap "+ Add Item to Vault" above to get started.</Text>
              </View>
            )
          ) : (
            filteredItems.map((item) => (
              <View key={item.id} style={s.listRow}>
                <View style={s.listIconWrap}>
                  <Text style={s.listIcon}>{item.file_name ? fileIcon(item.file_type) : (VAULT_CATEGORIES.find(c => c.key === item.category)?.icon || '📝')}</Text>
                </View>
                <View style={s.listInfo}>
                  <Text style={s.listLabel}>{item.title}</Text>
                  <Text style={s.listDesc}>
                    {VAULT_CATEGORIES.find(c => c.key === item.category)?.label || item.category}
                    {(item.username || item.password) ? '  ·  🔒 login saved' : ''}
                    {item.file_name ? `  ·  📎 ${item.file_name}` : ''}
                    {item.file_size ? `  ·  ${formatBytes(item.file_size)}` : ''}
                  </Text>
                </View>
                <View style={s.rowActions}>
                  <TouchableOpacity onPress={() => openEditModal(item)} style={s.editBtn} accessibilityLabel="Edit item" accessibilityRole="button">
                    <Text style={s.editBtnIcon}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmDelete(item)} style={s.deleteBtn} accessibilityLabel="Delete item" accessibilityRole="button">
                    <Text style={s.deleteBtnIcon}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        )}

      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : 'height'} style={{ width: '100%' }}>
            <View style={s.modalSheet}>
              <LinearGradient colors={['#F06292', '#F48A5A', '#FFD07A']} style={s.modalInner}>
                <View style={s.modalHandle} />
                <View style={s.modalHeader}>
                  <Text style={[s.modalTitle, { color: '#3D1020' }]}>{editingItem ? 'Edit Item' : 'Add to Vault'}</Text>
                  <TouchableOpacity onPress={closeModal}><View style={s.modalCloseBtn}><Text style={s.modalCloseX}>✕</Text></View></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={true} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Title *</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="e.g. My Will, Facebook Login" placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Description (optional)</Text>
                  <TextInput style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="Brief description" placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Username / Email (optional)</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="e.g. john@email.com or username"
                    placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.username}
                    onChangeText={v => setForm(f => ({ ...f, username: v }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Password / PIN (optional)</Text>
                  <View style={s.passwordRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginBottom: 0, backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                      placeholder="Enter password or PIN"
                      placeholderTextColor="rgba(61,16,32,0.35)"
                      value={form.password}
                      onChangeText={v => setForm(f => ({ ...f, password: v }))}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(p => !p)}
                      style={[s.passwordToggle, { backgroundColor: 'rgba(61,16,32,0.12)' }]}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Text style={s.passwordToggleIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.passwordHint, { color: '#7A3448' }]}>🔒 AES-256 encrypted — only you can read this</Text>

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>Notes / Content (optional)</Text>
                  <TextInput style={[s.input, { height: 100, textAlignVertical: 'top', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)', color: '#3D1020' }]}
                    placeholder="Website address, app name, any helpful notes..." placeholderTextColor="rgba(61,16,32,0.35)"
                    value={form.content} onChangeText={v => setForm(f => ({ ...f, content: v }))} multiline numberOfLines={4} />

                  <Text style={[s.fieldLabel, { color: '#7A3448' }]}>{existingFile ? 'Current File' : 'Attach File (optional)'}</Text>
                  {existingFile ? (
                    <View style={[s.filePickerBtn, { borderStyle: 'solid', backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)' }]}>
                      <View style={s.filePickerContent}>
                        <Text style={s.filePickerIcon}>{fileIcon(existingFile.mimeType)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.filePickerName, { color: '#3D1020' }]} numberOfLines={1}>{existingFile.name}</Text>
                          <Text style={[s.filePickerSize, { color: '#7A3448' }]}>{formatBytes(existingFile.size)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setRemoveExistingFile(true)}
                          style={[s.removeFileBtn, { backgroundColor: 'rgba(61,16,32,0.12)', borderColor: 'rgba(61,16,32,0.25)' }]}>
                          <Text style={[s.removeFileBtnText, { color: '#3D1020' }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={handlePickFile} style={[s.replaceFileLink, { borderTopColor: 'rgba(61,16,32,0.15)' }]}>
                        <Text style={[s.replaceFileLinkText, { color: '#7A3448' }]}>↑ Replace with a different file</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={handlePickFile}
                      style={[s.filePickerBtn, { backgroundColor: 'rgba(61,16,32,0.08)', borderColor: 'rgba(61,16,32,0.2)' }]}
                      activeOpacity={0.75}>
                      {pickedFile ? (
                        <View style={s.filePickerContent}>
                          <Text style={s.filePickerIcon}>{fileIcon(pickedFile.mimeType)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.filePickerName, { color: '#3D1020' }]} numberOfLines={1}>{pickedFile.name}</Text>
                            <Text style={[s.filePickerSize, { color: '#7A3448' }]}>{formatBytes(pickedFile.size)}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setPickedFile(null)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#7A3448', fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={s.filePickerContent}>
                          <Text style={s.filePickerIcon}>📎</Text>
                          <Text style={[s.filePickerPlaceholder, { color: 'rgba(61,16,32,0.45)' }]}>
                            {removeExistingFile ? 'File removed — tap to attach a new one' : 'Tap to attach a file'}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  {saveMsg ? <Text style={{ color: '#C0392B', fontSize: 14, marginBottom: 12 }}>{saveMsg}</Text> : null}
                  <TouchableOpacity onPress={handleSave} disabled={saving || uploading} activeOpacity={0.85} style={{ marginBottom: 8 }}>
                    <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnPrimary}>
                      {saving || uploading
                        ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <ActivityIndicator color="#fff" />
                            <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{uploading ? 'Uploading file…' : 'Saving…'}</Text>
                          </View>
                        : <Text style={[s.btnPrimaryText, { color: '#fff' }]}>{editingItem ? 'Save Changes' : 'Save to Vault'}</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </ScrollView>
              </LinearGradient>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Trusted Partners Modal (contextual from Legal/Financial categories) */}
      <ProfessionalServicesModal
        visible={showPartnersModal}
        onClose={() => setShowPartnersModal(false)}
      />

      {/* Facebook Import Modal */}
      <FacebookImportModal
        visible={showFbModal}
        onClose={() => setShowFbModal(false)}
        onImported={(count) => { setShowFbModal(false); loadAll() }}
      />

      {/* Delete Confirmation */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={s.confirmOverlay}>
          <View style={s.confirmBox}>
            <LinearGradient colors={WARM} style={s.confirmInner}>
              <Text style={s.confirmIcon}>🗑️</Text>
              <Text style={[s.confirmTitle, { color: WM.title }]}>Delete Item?</Text>
              <Text style={[s.confirmBody, { color: WM.sub }]}>
                "{confirmDelete?.title}" will be permanently deleted
                {confirmDelete?.file_name ? ', including the attached file' : ''}.{'\n'}This cannot be undone.
              </Text>
              <View style={s.confirmActions}>
                <TouchableOpacity
                  style={[s.confirmCancel, { borderColor: WM.border, backgroundColor: WM.cardBg }]}
                  onPress={() => setConfirmDelete(null)}>
                  <Text style={[s.confirmCancelText, { color: WM.title }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmDelete, { backgroundColor: '#F06292', borderColor: 'rgba(255,255,255,0.5)' }]}
                  onPress={handleDeleteItem} disabled={deleting}>
                  {deleting ? <ActivityIndicator color={WM.title} /> : <Text style={[s.confirmDeleteText, { color: WM.title }]}>Delete</Text>}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </ScreenWrap>
  )
}
