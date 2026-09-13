package ru.ultimatehockey.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "ApkUpdater")
public final class ApkUpdaterPlugin extends Plugin {
    private static final String ALLOWED_HOST = "ultimatehockey.ru";
    private static final int BUFFER_SIZE = 64 * 1024;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection;
    private volatile File downloadedApk;

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionCode", info.getLongVersionCode());
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read installed version", error);
        }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String rawUrl = call.getString("url");
        String expectedHash = call.getString("sha256");
        Long expectedSize = call.getLong("sizeBytes");
        Integer versionCode = call.getInt("versionCode");
        if (rawUrl == null || expectedHash == null || expectedSize == null || versionCode == null) {
            call.reject("Download metadata is incomplete");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            call.reject("An APK download is already active");
            return;
        }
        cancelled.set(false);
        getBridge().execute(() -> download(call, rawUrl, expectedHash, expectedSize, versionCode));
    }

    private void download(PluginCall call, String rawUrl, String expectedHash, long expectedSize, int versionCode) {
        File partial = null;
        HttpURLConnection connection = null;
        try {
            URL url = new URL(rawUrl);
            if (!"https".equals(url.getProtocol()) || !ALLOWED_HOST.equals(url.getHost()) || url.getPort() != -1
                    || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null
                    || !url.getPath().startsWith("/mobile/android/") || !url.getPath().endsWith(".apk")) {
                throw new IllegalArgumentException("APK URL is not allowed");
            }
            if (expectedSize < 1 || versionCode < 1 || !expectedHash.matches("[0-9a-f]{64}")) {
                throw new IllegalArgumentException("Invalid APK metadata");
            }
            File directory = new File(getContext().getCacheDir(), "updates");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Unable to create update cache");
            partial = new File(directory, "ultimate-hockey-" + versionCode + ".apk.part");
            File target = new File(directory, "ultimate-hockey-" + versionCode + ".apk");
            Files.deleteIfExists(partial.toPath());
            Files.deleteIfExists(target.toPath());

            connection = (HttpURLConnection) url.openConnection();
            activeConnection = connection;
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(30_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("APK download failed");
            long contentLength = connection.getContentLengthLong();
            if (contentLength != expectedSize) throw new IllegalStateException("APK size header mismatch");

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            try (FileOutputStream output = new FileOutputStream(partial);
                 java.io.InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.get()) throw new InterruptedException("APK download cancelled");
                    received += count;
                    if (received > expectedSize) throw new IllegalStateException("APK exceeds expected size");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    JSObject progress = new JSObject();
                    progress.put("bytesDownloaded", received);
                    progress.put("totalBytes", expectedSize);
                    notifyListeners("downloadProgress", progress);
                }
                output.flush();
                output.getFD().sync();
            }
            if (received != expectedSize) throw new IllegalStateException("APK size mismatch");
            String actualHash = hex(digest.digest());
            if (!actualHash.equals(expectedHash)) {
                throw new IllegalStateException("APK checksum mismatch");
            }
            Files.move(partial.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
            downloadedApk = target;
            JSObject result = new JSObject();
            result.put("path", "updates/" + target.getName());
            call.resolve(result);
        } catch (InterruptedException error) {
            if (partial != null) partial.delete();
            call.reject("APK download cancelled");
            Thread.currentThread().interrupt();
        } catch (Exception error) {
            if (partial != null) partial.delete();
            if (cancelled.get()) call.reject("APK download cancelled");
            else call.reject("Unable to download verified APK", error);
        } finally {
            if (connection != null) connection.disconnect();
            activeConnection = null;
            downloading.set(false);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled.set(true);
        HttpURLConnection connection = activeConnection;
        if (connection != null) connection.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermission(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        File apk = downloadedApk;
        if (apk == null || !apk.isFile()) {
            call.reject("No verified APK is ready");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
