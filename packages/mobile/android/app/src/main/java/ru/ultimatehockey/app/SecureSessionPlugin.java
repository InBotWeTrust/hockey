package ru.ultimatehockey.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public final class SecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "ultimate_hockey_session_v1";
    private static final String PREFS_NAME = "ultimate_hockey_secure_session";
    private static final String PREF_VALUE = "encrypted_session";
    private static final String PREF_PENDING_AUTH = "encrypted_pending_auth";
    private static final int IV_BYTES = 12;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String preferenceKey(PluginCall call) {
        String slot = call.getString("slot");
        if (slot == null || slot.equals("session")) return PREF_VALUE;
        if (slot.equals("pendingAuth")) return PREF_PENDING_AUTH;
        throw new IllegalArgumentException("Unknown secure storage slot");
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void save(PluginCall call) {
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required");
            return;
        }
        try {
            String preferenceKey = preferenceKey(call);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            if (iv.length != IV_BYTES) throw new IllegalStateException("Unexpected GCM IV length");
            String stored = Base64.encodeToString(iv, Base64.NO_WRAP) + "." +
                    Base64.encodeToString(encrypted, Base64.NO_WRAP);
            preferences().edit().putString(preferenceKey, stored).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to protect session", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        JSObject result = new JSObject();
        try {
            String preferenceKey = preferenceKey(call);
            String stored = preferences().getString(preferenceKey, null);
            if (stored == null) {
                call.resolve(result);
                return;
            }
            String[] parts = stored.split("\\.", 2);
            if (parts.length != 2) throw new IllegalArgumentException("Invalid encrypted session");
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            result.put("value", new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) {
            String slot = call.getString("slot");
            String key = "pendingAuth".equals(slot) ? PREF_PENDING_AUTH : PREF_VALUE;
            preferences().edit().remove(key).apply();
            call.resolve(new JSObject());
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            preferences().edit().remove(preferenceKey(call)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to clear protected session", error);
        }
    }
}
