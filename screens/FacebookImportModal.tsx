import { useState, useEffect } from 'react'
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Image, Dimensions,
} from 'react-native'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import { WARM, WM, PLUM } from '../lib/constants'

WebBrowser.maybeCompleteAuthSession()

const FB_APP_ID = '1340310048005725'
const IMG_SIZE   = (Dimensions.get('window').width - 64) / 3

const discovery = {
  authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
}

type Step = 'connect' | 'select' | 'importing' | 'done'

interface Props {
  visible:    boolean
  onClose:    () => void
  onImported: (count: number) => void
}

export default function FacebookImportModal({ visible, onClose, onImported }: Props) {
  const [step,           setStep]           = useState<Step>('connect')
  const [photos,         setPhotos]         = useState<any[]>([])
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [loadingPhotos,  setLoadingPhotos]  = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [error,          setError]          = useState('')

  const redirectUri = 'https://auth.expo.io/@sokhaeang/Solace-Life'
  console.log('FB redirect URI:', redirectUri)

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     FB_APP_ID,
      scopes:       ['public_profile'],
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      extraParams:  { display: 'popup' },
    },
    discovery
  )

  useEffect(() => {
    if (response?.type === 'success') {
      const token = (response as any).params?.access_token
      if (token) fetchPhotos(token)
      else setError('No access token received. Please try again.')
    } else if (response?.type === 'error') {
      setError('Facebook login failed. Please try again.')
    }
  }, [response])

  async function fetchPhotos(token: string) {
    setLoadingPhotos(true)
    setStep('select')
    try {
      // Fetch basic profile to confirm login worked
      const profileRes  = await fetch(
        `https://graph.facebook.com/me?fields=id,name,picture&access_token=${token}`
      )
      const profile = await profileRes.json()
      if (profile.error) {
        setError(profile.error.message)
        setStep('connect')
        setLoadingPhotos(false)
        return
      }

      // Attempt to fetch photos — requires user_photos permission (Meta App Review needed)
      const res  = await fetch(
        `https://graph.facebook.com/me/photos?type=uploaded&fields=id,name,images,created_time&access_token=${token}&limit=50`
      )
      const data = await res.json()
      if (data.error) {
        // user_photos not yet approved — show pending message
        setError(
          `Connected as ${profile.name}. Photo access requires Meta App Review approval. ` +
          `Once approved, your photos will appear here automatically.`
        )
      } else {
        setPhotos(data.data || [])
      }
    } catch (e: any) {
      setError('Could not load photos: ' + e.message)
      setStep('connect')
    }
    setLoadingPhotos(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev =>
      prev.size === photos.length ? new Set() : new Set(photos.map(p => p.id))
    )
  }

  async function handleImport() {
    if (selected.size === 0) return
    setStep('importing')
    setImportProgress(0)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setStep('select'); return }

    const toImport = photos.filter(p => selected.has(p.id))
    let imported   = 0

    for (const photo of toImport) {
      try {
        // Use the largest available image
        const imageUrl = photo.images?.[0]?.source
        if (!imageUrl) continue

        const imgRes = await fetch(imageUrl)
        const blob   = await imgRes.blob()

        const storagePath = `${user.id}/facebook/fb_${photo.id}.jpg`
        const { error: upErr } = await supabase.storage
          .from('vault-files')
          .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })
        if (upErr) continue

        const caption = photo.name || 'Facebook Memory'
        const dateStr = photo.created_time
          ? new Date(photo.created_time).toLocaleDateString('en-CA', {
              year: 'numeric', month: 'long', day: 'numeric',
            })
          : ''

        await supabase.from('vault_items').insert({
          user_id:     user.id,
          title:       caption.length > 80 ? caption.slice(0, 77) + '…' : caption,
          category:    'media',
          description: dateStr ? `Imported from Facebook · ${dateStr}` : 'Imported from Facebook',
          file_path:   storagePath,
          file_name:   `fb_${photo.id}.jpg`,
          file_size:   blob.size,
          file_type:   'image/jpeg',
        })

        imported++
        setImportProgress(Math.round((imported / toImport.length) * 100))
      } catch {
        // Skip failed photos and continue
      }
    }

    setStep('done')
    onImported(imported)
  }

  function handleClose() {
    setStep('connect')
    setPhotos([])
    setSelected(new Set())
    setImportProgress(0)
    setError('')
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }} activeOpacity={1} onPress={handleClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
        <LinearGradient colors={WARM} style={{
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 24, maxHeight: '88%',
        }}>

          {/* ── Header ── */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ color: WM.title, fontSize: 20, fontWeight: '700' }}>
              {step === 'done' ? '✅ Import Complete' : '📸 Import from Facebook'}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: WM.sub, fontSize: 20, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: WM.sub, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
            {step === 'connect'   && 'Connect your Facebook account to import your photos into the Vault.'}
            {step === 'select'    && (loadingPhotos ? 'Loading your photos…' : `${photos.length} photo${photos.length !== 1 ? 's' : ''} found. Select the ones you'd like to save.`)}
            {step === 'importing' && `Saving to your Vault… ${importProgress}% complete`}
            {step === 'done'      && 'Your Facebook photos have been saved to the Vault under Personal Messages.'}
          </Text>

          {error ? (
            <Text style={{ color: '#C0392B', fontSize: 13, marginBottom: 14 }}>{error}</Text>
          ) : null}

          {/* ── CONNECT ── */}
          {step === 'connect' && (
            <TouchableOpacity
              disabled={!request}
              onPress={() => { setError(''); promptAsync() }}
              activeOpacity={0.85}>
              <View style={{
                backgroundColor: '#1877F2', borderRadius: 14, padding: 16,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', fontStyle: 'italic' }}>f</Text>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Continue with Facebook</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* ── SELECT ── */}
          {step === 'select' && (
            loadingPhotos
              ? <ActivityIndicator color={WM.accent} size="large" style={{ marginVertical: 30 }} />
              : (
                <>
                  {photos.length > 0 && (
                    <TouchableOpacity onPress={toggleAll} style={{ marginBottom: 12 }}>
                      <Text style={{ color: WM.accent, fontWeight: '600', fontSize: 14 }}>
                        {selected.size === photos.length ? '✕  Deselect All' : '✓  Select All'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {photos.map(photo => {
                        const imgUrl     = photo.images?.[photo.images.length - 1]?.source
                        const isSelected = selected.has(photo.id)
                        return (
                          <TouchableOpacity
                            key={photo.id}
                            onPress={() => toggleSelect(photo.id)}
                            activeOpacity={0.8}
                            style={{
                              width: IMG_SIZE, height: IMG_SIZE, borderRadius: 8,
                              borderWidth: isSelected ? 3 : 0,
                              borderColor: WM.accent, overflow: 'hidden',
                              backgroundColor: 'rgba(61,16,32,0.08)',
                            }}>
                            {imgUrl
                              ? <Image source={{ uri: imgUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 24 }}>🖼️</Text>
                                </View>
                            }
                            {isSelected && (
                              <View style={{
                                position: 'absolute', top: 4, right: 4,
                                backgroundColor: WM.accent, borderRadius: 10,
                                width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </ScrollView>

                  {photos.length === 0 && (
                    <Text style={{ color: WM.sub, textAlign: 'center', marginVertical: 20 }}>
                      No photos found on this account.
                    </Text>
                  )}

                  {selected.size > 0 && (
                    <TouchableOpacity onPress={handleImport} activeOpacity={0.85} style={{ marginTop: 16 }}>
                      <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, padding: 16, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                          Import {selected.size} Photo{selected.size !== 1 ? 's' : ''}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </>
              )
          )}

          {/* ── IMPORTING ── */}
          {step === 'importing' && (
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <ActivityIndicator color={WM.accent} size="large" />
              <Text style={{ color: WM.title, fontSize: 16, fontWeight: '600', marginTop: 16 }}>
                Saving to your Vault…
              </Text>
              <View style={{
                width: '100%', height: 8, backgroundColor: 'rgba(61,16,32,0.12)',
                borderRadius: 4, marginTop: 20, overflow: 'hidden',
              }}>
                <View style={{
                  height: '100%', backgroundColor: WM.accent,
                  borderRadius: 4, width: `${importProgress}%`,
                }} />
              </View>
              <Text style={{ color: WM.sub, marginTop: 10, fontSize: 14 }}>
                {importProgress}% complete
              </Text>
            </View>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 52, marginBottom: 14 }}>🎉</Text>
              <Text style={{ color: WM.title, fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 24 }}>
                Photos imported and saved to your Vault under Personal Messages.
              </Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.85} style={{ marginTop: 24, width: '100%' }}>
                <LinearGradient colors={PLUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

        </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
