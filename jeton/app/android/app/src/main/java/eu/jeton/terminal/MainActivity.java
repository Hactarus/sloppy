package eu.jeton.terminal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import eu.jeton.nfc.JetonNfcPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JetonNfcPlugin.class); // in-repo plugin, see android-plugins/nfc
        super.onCreate(savedInstanceState);
    }
}
