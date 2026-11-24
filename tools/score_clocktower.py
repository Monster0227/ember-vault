"""Five-beat bronze carillon above the clockwork of the final climb."""
SCORES = {
    'tower': (65, 'lydian', 96, 5, 'carillon',
              [0, 1, 4, 0, 5, 2, 4, 0, 1, 3, 6, 4, 2, 1, 4, 0], [
        '0/1.5 4/.5 7/2 _', '6 3/1.5 _/.5 1/2',
        '_ 4/.5 6/.5 8 7/2', '4/2 _ 0/2',
        '2/.5 4/.5 5/2 _ 9', '8/1.5 5/.5 2/2 _',
        '4 1 3 6/1.5 _/.5', '7/2.5 4/.5 0/2',
        '_ 1 3/.5 5/.5 8/2', '10/1.5 9/.5 6 3/2',
        '6/.5 8/.5 11/2 9 _', '4/2.5 _/.5 1 4',
        '9 5 2/1.5 0/.5 _', '3/2 6/.5 8/.5 5/2',
        '4/1.5 1/.5 3 6 4', '7/2 _ 0/2'
    ])
}


def accompany(name, bar, start, chord, meter, tone, tap):
    """The escapement clicks in pairs; a much lower bell answers every fourth bar."""
    if bar % 4 != 3:
        tone(start + .05, chord - 14, 1.35, 'felt', .105, -.34)
        tap(start + 2.50, 'rim', .025)
        tap(start + 3.03, 'rim', .018)
    if bar % 4 in (0, 2):
        tone(start + 3.50, chord - 3, .42, 'dulcimer', .065, .42)
    if bar % 4 == 3:
        tone(start + .04, chord - 14, 2.7, 'carillon', .142, -.31)
    if 8 <= bar < 16 and bar % 2 == 0:
        tone(start + 1.42, chord - 3, 1.65, 'air', .054, .28)
