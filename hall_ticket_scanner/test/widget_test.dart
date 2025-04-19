import 'package:flutter_test/flutter_test.dart';
import 'package:hall_ticket_scanner/main.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

void main() {
  testWidgets('QR Scanner page loads correctly', (WidgetTester tester) async {
    // Build the app
    await tester.pumpWidget(HallTicketScannerApp()); // Corrected class name

    // Check for AppBar title
    expect(find.text('Hall Ticket Scanner'), findsOneWidget);

    // Since MobileScanner uses native view, we can't directly test scanning
    // But we can confirm the widget tree loads properly
    expect(find.byType(MobileScanner), findsOneWidget);
  });
}
