import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mawja/main.dart';

void main() {
  testWidgets('Mawja app boots and shows the bottom navigation',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MawjaApp());
    await tester.pump();

    // The shell should render a NavigationBar with the four sections.
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
