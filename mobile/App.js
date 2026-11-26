// DSKRISHNA Valuation Desk – Android app.
// A native shell around the live portal: everything the web app does works here, and portal updates reach the app
// without a new APK. The shell adds what a plain WebView can't do: camera / GPS permissions, the Android back button,
// an offline screen, opening WhatsApp / phone / Maps in their apps, sharing downloads and printing reports to PDF.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Image, Linking, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import Constants from 'expo-constants';
import { BRIDGE } from './src/bridge';

SplashScreen.preventAutoHideAsync();

const PORTAL = Constants.expoConfig?.extra?.portalUrl || 'https://portal.dskrishna.in';
const PORTAL_HOST = new URL(PORTAL).host;
const BLUE = '#1d4ed8';
// back in the app after this long: reload so the latest deployed portal is shown
const REFRESH_AFTER_MS = 15 * 60 * 1000;

// links that belong to other apps (or other websites) open outside the WebView
const isInternal = (url) => {
  if (/^(about:blank|blob:|data:)/.test(url)) return true;
  try {
    return new URL(url).host === PORTAL_HOST;
  } catch {
    return false;
  }
};

// Camera: declared in app.json, but Android also needs it granted at runtime. Without it the WebView cannot open the
// camera for a photo input, and its file picker is left waiting — after that even "+ Upload" stops responding. So the
// app asks once, up front (nothing is shown when it is already allowed).
async function ensureCameraPermission() {
  if (Platform.OS !== 'android') return true;
  const camera = PermissionsAndroid.PERMISSIONS.CAMERA;
  try {
    if (await PermissionsAndroid.check(camera)) return true;
    const result = await PermissionsAndroid.request(camera, {
      title: 'Allow the camera',
      message: 'DSKRISHNA uses the camera to take site photos for the input sheet.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

function Shell() {
  const web = useRef(null);
  const canGoBack = useRef(false);
  const askedCamera = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const net = useNetworkState();
  const offline = net.isConnected === false;

  // Android back: go back inside the portal first, leave the app only from the first page
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && web.current) {
        web.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  // returning after a long break: pick up the latest portal version, unless the user is mid-way through a form
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { leftAt = Date.now(); return; }
      if (leftAt && Date.now() - leftAt > REFRESH_AFTER_MS) {
        web.current?.injectJavaScript("(function(){ var p = location.pathname; var busy = ['/edit', '/new', '/report'].some(function (e) { return p.slice(-e.length) === e; }); if (!busy && !document.querySelector('.modal-backdrop')) location.reload(); })(); true;");
      }
    });
    return () => sub.remove();
  }, []);

  // came back online after a failed load: try again by itself
  useEffect(() => {
    if (!offline && failed) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  const retry = useCallback(() => {
    setFailed(false);
    web.current?.reload();
  }, []);

  const openExternal = useCallback((url) => {
    Linking.openURL(url).catch(() => Alert.alert("Can't open link", 'No app on this phone can open this link.'));
  }, []);

  const onMessage = useCallback(async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    try {
      if (msg.type === 'external') openExternal(msg.url);
      else if (msg.type === 'location') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        web.current?.injectJavaScript(`window.__dskLocation && window.__dskLocation(${status === 'granted'}); true;`);
      } else if (msg.type === 'print') {
        // Android print dialog: pick a printer or "Save as PDF"
        await Print.printAsync({ html: msg.html });
      } else if (msg.type === 'file') {
        const safe = String(msg.name || 'file').replace(/[^\w.\- ]+/g, '_');
        const file = new File(Paths.cache, `${Date.now()}-${safe}`);
        file.create();
        await file.write(msg.base64, { encoding: 'base64' });
        await Sharing.shareAsync(file.uri, { mimeType: msg.mime, dialogTitle: msg.share ? `Save or share ${safe}` : `Open ${safe}` });
      } else if (msg.type === 'error') {
        Alert.alert('Something went wrong', msg.message);
      }
    } catch (e) {
      if (!/cancel/i.test(String(e?.message))) Alert.alert('Something went wrong', String(e?.message || e));
    }
  }, [openExternal]);

  const onShouldStart = useCallback((req) => {
    const { url } = req;
    if (isInternal(url)) return true;
    // tel:, mailto:, whatsapp:, wa.me, Google Maps, any other site
    openExternal(url);
    return false;
  }, [openExternal]);

  const showError = failed || (offline && !loaded);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <WebView
        ref={web}
        source={{ uri: PORTAL }}
        style={styles.web}
        injectedJavaScriptBeforeContentLoaded={BRIDGE}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={(s) => { canGoBack.current = s.canGoBack; }}
        onLoadEnd={() => {
          setLoaded(true);
          SplashScreen.hide();
          // once the portal is showing: make sure photos can be taken (asked once per app start)
          if (!askedCamera.current) { askedCamera.current = true; ensureCameraPermission(); }
        }}
        onError={() => { setFailed(true); SplashScreen.hide(); }}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500 && !e.nativeEvent.url.includes('/api/')) setFailed(true); }}
        onRenderProcessGone={() => web.current?.reload()}
        applicationNameForUserAgent="DSKRISHNA-App/1.0"
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowFileAccess
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        overScrollMode="never"
        textZoom={100}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        )}
      />
      {showError && (
        <View style={styles.offline}>
          <Image source={require('./assets/icon.png')} style={styles.offlineLogo} />
          <Text style={styles.offlineTitle}>{offline ? "You're offline" : "Can't reach DSKRISHNA"}</Text>
          <Text style={styles.offlineText}>
            {offline ? 'Check your mobile data or Wi-Fi. The app reconnects by itself when you are back online.' : 'The portal did not respond. Check your connection and try again.'}
          </Text>
          <Pressable style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]} onPress={retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  web: { flex: 1, backgroundColor: '#f4f6fb' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  offline: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 32 },
  offlineLogo: { width: 72, height: 72, borderRadius: 18, marginBottom: 20 },
  offlineTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  offlineText: { fontSize: 15, lineHeight: 22, color: '#475569', textAlign: 'center', marginBottom: 24 },
  retry: { backgroundColor: BLUE, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  retryText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
